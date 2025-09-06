/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useState, useContext, ReactNode, useCallback } from 'react';

interface ToastMessage {
    id: number;
    message: string;
    type: 'success' | 'error';
}

interface ToastContextType {
    addToast: (message: string, type: 'success' | 'error') => void;
    toasts: ToastMessage[];
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const useToast = () => {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return context;
};

let toastId = 0;

export const ToastProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [toasts, setToasts] = useState<ToastMessage[]>([]);

    const addToast = useCallback((message: string, type: 'success' | 'error') => {
        const id = toastId++;
        setToasts(prevToasts => [...prevToasts, { id, message, type }]);
        setTimeout(() => {
            removeToast(id);
        }, 5000); // 5 seconds
    }, []);
    
    const removeToast = (id: number) => {
        setToasts(prevToasts => prevToasts.filter(toast => toast.id !== id));
    };

    return (
        <ToastContext.Provider value={{ addToast, toasts }}>
            {children}
        </ToastContext.Provider>
    );
};
