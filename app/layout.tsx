// app/layout.tsx
import "./global.css";
import { SoundProvider } from "./context/SoundContext";
import { LearnerProvider } from "./context/LearnerContext";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <head>
        <title>Pedagogical Piano Plateform</title>
      </head>
      <body>
        <SoundProvider>
          <LearnerProvider>
            {children}
          </LearnerProvider>
        </SoundProvider>
      </body>
    </html>
  );
}
