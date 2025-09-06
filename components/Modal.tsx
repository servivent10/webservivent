/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef } from 'react';
import './Modal.css';
import './Button.css';

interface ModalProps {
    title: string;
    onClose: () => void;
    children: React.ReactNode;
    className?: string; // Permitir clases personalizadas
}

const Modal: React.FC<ModalProps> = ({ title, onClose, children, className }) => {
    const modalRef = useRef<HTMLDivElement>(null);

    // Cerrar el modal al hacer clic fuera de él
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [onClose]);

    // Cerrar el modal al presionar la tecla 'Escape'
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onClose();
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [onClose]);


    return (
        <div className={`modal-overlay ${className || ''}`} role="dialog" aria-modal="true" aria-labelledby="modal-title">
            <div className="modal" ref={modalRef}>
                <div className="modal__header">
                    <h3 id="modal-title">{title}</h3>
                    <button onClick={onClose} className="btn-icon" aria-label="Cerrar modal">
                        <span className="material-icons">close</span>
                    </button>
                </div>
                {children}
            </div>
        </div>
    );
};

export default Modal;