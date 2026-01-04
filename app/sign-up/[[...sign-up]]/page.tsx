'use client';

import { SignUp } from '@clerk/nextjs';
import { useSearchParams } from 'next/navigation';

export default function SignUpPage() {
    const searchParams = useSearchParams();
    const returnUrl = searchParams.get('returnUrl') || '/dashboard';

    return (
        <div className="min-h-screen bg-chaos-900 flex items-center justify-center p-4">
            <div className="w-full max-w-md">
                <div className="text-center mb-8">
                    <div className="w-20 h-20 bg-gradient-to-br from-chaos-accent/30 to-chaos-accent/10 rounded-2xl border border-chaos-accent/20 backdrop-blur-sm mx-auto mb-6 flex items-center justify-center">
                        <span className="text-4xl font-serif text-chaos-accent">C</span>
                    </div>
                    <h1 className="text-4xl font-serif text-white mb-2">Join Chaos</h1>
                    <p className="text-chaos-accent/70">Create an account to get started</p>
                </div>
                <SignUp
                    forceRedirectUrl={returnUrl}
                    fallbackRedirectUrl="/dashboard"
                    appearance={{
                        elements: {
                            rootBox: "mx-auto",
                            card: "bg-chaos-800 shadow-2xl border border-chaos-accent/20 rounded-2xl",
                            headerTitle: "hidden",
                            headerSubtitle: "hidden",
                            socialButtonsBlockButton: "bg-chaos-700 border border-chaos-accent/20 text-white hover:bg-chaos-accent/10 hover:border-chaos-accent/40 transition-all duration-300",
                            socialButtonsBlockButtonText: "text-white font-medium",
                            dividerLine: "bg-chaos-accent/20",
                            dividerText: "text-chaos-accent/50 text-sm",
                            formButtonPrimary: "bg-chaos-accent hover:bg-chaos-accent/90 text-chaos-900 font-semibold shadow-lg shadow-chaos-accent/20 transition-all duration-300 hover:shadow-chaos-accent/30 hover:scale-[1.02]",
                            formFieldInput: "bg-chaos-700 border-chaos-accent/20 text-white placeholder:text-gray-500 focus:border-chaos-accent focus:ring-chaos-accent/50 rounded-lg transition-all duration-200",
                            formFieldLabel: "text-chaos-accent/80 font-medium",
                            footerActionLink: "text-chaos-accent hover:text-chaos-accent/80 font-medium transition-colors duration-200",
                            footerActionText: "text-gray-400",
                            identityPreviewText: "text-white",
                            identityPreviewEditButton: "text-chaos-accent hover:text-chaos-accent/80",
                            formHeaderTitle: "text-white",
                            formHeaderSubtitle: "text-gray-400",
                            otpCodeFieldInput: "bg-chaos-700 border-chaos-accent/20 text-white focus:border-chaos-accent",
                            formResendCodeLink: "text-chaos-accent hover:text-chaos-accent/80",
                            alertText: "text-white",
                            formFieldInputShowPasswordButton: "text-chaos-accent hover:text-chaos-accent/80",
                        },
                        layout: {
                            socialButtonsPlacement: "bottom",
                            socialButtonsVariant: "blockButton",
                        }
                    }}
                />
            </div>
        </div>
    );
}
