import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    // Get the URL to proxy from the query string
    const { searchParams } = new URL(request.url);
    const url = searchParams.get('url');
    
    if (!url) {
      return NextResponse.json({ error: 'No URL provided' }, { status: 400 });
    }

    console.log(`Proxying request to: ${url}`);
    
    // Use fetch with no-cors mode to ensure we can fetch the resource
    const response = await fetch(url, {
      headers: {
        'Accept': '*/*',
      },
    });
    
    if (!response.ok) {
      console.error(`Error fetching resource: ${response.status} ${response.statusText}`);
      return NextResponse.json(
        { error: `Failed to fetch from URL: ${response.statusText}` },
        { status: response.status }
      );
    }

    // Get the content type to determine how to handle the response
    const contentType = response.headers.get('content-type') || '';
    console.log(`Resource content type: ${contentType}`);
    
    // Handle binary data (like MIDI files)
    if (contentType.includes('audio') || 
        contentType.includes('application/octet-stream') ||
        contentType.includes('application/midi') ||
        (url.includes('.mid') && !contentType.includes('text'))) {
      
      const arrayBuffer = await response.arrayBuffer();
      console.log(`Retrieved binary data of size: ${arrayBuffer.byteLength} bytes`);
      
      return new NextResponse(arrayBuffer, {
        headers: {
          'Content-Type': contentType || 'application/octet-stream',
          'Cache-Control': 'public, max-age=3600',
          'Access-Control-Allow-Origin': '*',
        }
      });
    } 
    // Handle JSON data
    else if (contentType.includes('application/json')) {
      const json = await response.json();
      return NextResponse.json(json, {
        headers: {
          'Cache-Control': 'public, max-age=3600',
          'Access-Control-Allow-Origin': '*',
        }
      });
    }
    // Handle regular text data
    else {
      const text = await response.text();
      console.log(`Retrieved text data: ${text.substring(0, 100)}...`);
      
      return new NextResponse(text, {
        headers: {
          'Content-Type': contentType || 'text/plain',
          'Cache-Control': 'public, max-age=3600',
          'Access-Control-Allow-Origin': '*',
        }
      });
    }
  } catch (error) {
    console.error('Proxy error:', error);
    return NextResponse.json(
      { error: 'Failed to proxy content', details: String(error) }, 
      { status: 500 }
    );
  }
}
