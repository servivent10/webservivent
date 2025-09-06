/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { HeaderProps } from '../types';
import Avatar from './Avatar';
import ProfileMenu from './ProfileMenu';
import './Header.css';

const Header: React.FC<HeaderProps> = ({ user, profile, setCurrentPage, onToggleSidebar }) => (
    <header className="header">
        <div className="header__left-controls">
            <button onClick={onToggleSidebar} className="header__menu-toggle" aria-label="Alternar menú">
                <span className="material-icons">menu</span>
            </button>
            <div className="header__title">ServiVENT</div>
        </div>
        <div className="header__user-profile">
            {profile && <Avatar userName={profile.nombre} avatarUrl={profile.avatar_link} />}
            <div className="header__user-info">
                <span className="header__user-name">{profile?.nombre || user.email}</span>
                {profile?.rol && profile?.sucursal?.nombre && (
                     <span className="header__user-role">{profile.rol} @ {profile.sucursal.nombre}</span>
                )}
            </div>
            <ProfileMenu setCurrentPage={setCurrentPage} profile={profile} />
        </div>
    </header>
);

export default Header;