'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useMutation, useConvex } from 'convex/react';
import { api } from '@/convex/_generated/api';

interface User {
    _id: string;
    email: string;
    username: string;
    name: string;
    avatar?: string;
    isCreator: boolean;
}

interface AuthContextType {
    user: User | null;
    login: (email: string, password: string) => Promise<void>;
    signup: (email: string, password: string, username: string, name: string) => Promise<void>;
    logout: () => void;
    isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const convex = useConvex();
    const createUserMutation = useMutation(api.users.createUser);

    // Load and verify user from localStorage on mount
    useEffect(() => {
        const loadUser = async () => {
            const savedUser = localStorage.getItem('chaos_user_v3');
            if (savedUser) {
                try {
                    const parsed = JSON.parse(savedUser);
                    // Basic validation to ensure we don't load garbage/fake IDs
                    if (parsed && parsed._id) {
                        // Verify the user still exists in the database
                        try {
                            const verifiedUser = await convex.query(api.users.getUserById, {
                                userId: parsed._id
                            });

                            if (verifiedUser) {
                                // User exists and is valid
                                setUser(verifiedUser as User);
                            } else {
                                // User ID no longer valid, clear localStorage
                                localStorage.removeItem('chaos_user_v3');
                                setUser(null);
                            }
                        } catch (error) {
                            // Error verifying user (e.g., invalid ID format), clear localStorage
                            console.error('Error verifying user:', error);
                            localStorage.removeItem('chaos_user_v3');
                            setUser(null);
                        }
                    } else {
                        localStorage.removeItem('chaos_user_v3');
                    }
                } catch (e) {
                    localStorage.removeItem('chaos_user_v3');
                }
            }
            setIsLoading(false);
        };

        loadUser();
    }, [convex]);

    const login = async (email: string, password: string) => {
        try {
            const user = await convex.query(api.users.loginUser, { email, password });
            if (!user) {
                throw new Error('Invalid credentials');
            }

            // Cast the result to User type since our query returns the object structure we expect
            const userData = user as User;
            setUser(userData);
            localStorage.setItem('chaos_user_v3', JSON.stringify(userData));
        } catch (error) {
            console.error('Login failed:', error);
            throw error;
        }
    };

    const signup = async (email: string, password: string, username: string, name: string) => {
        try {
            const userId = await createUserMutation({ email, password, username, name });

            const newUser: User = {
                _id: userId,
                email,
                username,
                name,
                isCreator: true,
            };

            setUser(newUser);
            localStorage.setItem('chaos_user_v3', JSON.stringify(newUser));
        } catch (error) {
            throw error;
        }
    };

    const logout = () => {
        setUser(null);
        localStorage.removeItem('chaos_user_v3');
    };

    return (
        <AuthContext.Provider value={{ user, login, signup, logout, isLoading }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within AuthProvider');
    }
    return context;
}
