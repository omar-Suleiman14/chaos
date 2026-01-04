import type { Metadata } from 'next';
import { Instrument_Serif, Inter } from 'next/font/google';
import './globals.css';
import { ClerkProvider } from '@clerk/nextjs';
import { ConvexClientProvider } from '@/components/ConvexClientProvider';

const instrumentSerif = Instrument_Serif({
    weight: ['400'],
    subsets: ['latin'],
    variable: '--font-serif',
    style: ['normal', 'italic'],
});

const inter = Inter({
    subsets: ['latin'],
    variable: '--font-sans',
});

export const metadata: Metadata = {
    title: 'Chaos',
    description: 'Create stunning, interactive quizzes that feel like a social feed.',
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <ClerkProvider>
            <html lang="en" className={`${instrumentSerif.variable} ${inter.variable}`}>
                <body className="antialiased">
                    <ConvexClientProvider>{children}</ConvexClientProvider>
                </body>
            </html>
        </ClerkProvider>
    );
}
