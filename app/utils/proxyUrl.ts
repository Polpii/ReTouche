/**
 * Converts a URL to be fetched through the proxy
 * @param url The original URL that has CORS issues
 * @returns The proxied URL to use instead
 */
export function getProxiedUrl(url: string): string {
  // Return early if null or empty
  if (!url) return url;
  
  // Skip proxying for local URLs or relative paths
  if (url.startsWith('/') || url.startsWith('blob:') || url.startsWith('data:')) {
    console.log(`Using original local URL: ${url}`);
    return url;
  }

  // Check if it's a Firebase Storage URL or any external URL
  if (url.includes('http')) {
    // Use URL encoding to safely pass the URL as a query parameter
    const encodedUrl = encodeURIComponent(url);
    const proxiedUrl = `/api/proxy?url=${encodedUrl}`;
    console.log(`Proxying URL: ${url} → ${proxiedUrl}`);
    return proxiedUrl;
  }
  
  // Return the original URL if it doesn't need proxying
  console.log(`Using original URL (not proxied): ${url}`);
  return url;
}
