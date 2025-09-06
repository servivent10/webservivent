/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { Page, AppUser } from '../types';
import './ProfileMenu.css';

interface ProfileMenuProps {
    setCurrentPage: (page: Page) => void;
    profile: AppUser | null;
}

const ProfileMenu: React.FC<ProfileMenuProps> = ({ setCurrentPage, profile }) => {
    const [isOpen, setIsOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleNavigation = (page: Page) => {
        setCurrentPage(page);
        setIsOpen(false);
    };

    const isOwner = profile?.rol === 'Propietario';

    return (
        <div className="profile-menu" ref={menuRef}>
            <button onClick={() => setIsOpen(!isOpen)} className="profile-menu__trigger" aria-haspopup="true" aria-expanded={isOpen}>
                <span className="material-icons">expand_more</span>
            </button>
            {isOpen && (
                <div className="profile-menu__dropdown">
                    {isOwner && (
                        <a className="profile-menu__item" onClick={() => handleNavigation('branches')}>
                            <span className="material-icons">store</span>
                            Sucursales
                        </a>
                    )}
                    <a className="profile-menu__item" onClick={() => handleNavigation('users')}>
                         <span className="material-icons">group</span>
                        Usuarios
                    </a>
                    <div className="profile-menu__divider"></div>
                    <a className="profile-menu__item" onClick={() => supabase.auth.signOut()}>
                        <span className="material-icons">logout</span>
                        Cerrar Sesión
                    </a>
                </div>
            )}
        </div>
    );
};

export default ProfileMenu;