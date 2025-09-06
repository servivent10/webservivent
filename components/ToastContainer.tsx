/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useToast } from '../contexts/ToastContext';
import './ToastContainer.css';

const ToastContainer: React.FC = () => {
    const { toasts } = useToast();

    if (!toasts.length) return null;

    return (
        <div className="toast-container">
            {toasts.map(toast => (
                <div key={toast.id} className={`toast toast--${toast.type}`}>
                     <span className="material-icons toast__icon">
                        {toast.type === 'success' ? 'check_circle' : 'error'}
                    </span>
                    <p>{toast.message}</p>
                </div>
            ))}
        </div>
    );
};

export default ToastContainer;