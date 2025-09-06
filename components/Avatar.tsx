/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import { AvatarProps } from '../types';
import './Avatar.css';

const Avatar: React.FC<AvatarProps> = ({ userName, avatarUrl }) => {
    const getInitials = (name: string) => {
        if (!name) return '?';
        const words = name.split(' ');
        if (words.length > 1) {
            return words.map(w => w[0]).join('').toUpperCase().slice(0, 3);
        }
        return name.slice(0, 2).toUpperCase();
    };

    const avatarContent = useMemo(() => {
        if (avatarUrl) {
            return <img src={avatarUrl} alt={userName} className="avatar__image" />;
        }
        return <span className="avatar__initials">{getInitials(userName)}</span>;
    }, [avatarUrl, userName]);
    
    // Función hash simple para obtener un color a partir del nombre del usuario
    const avatarColor = useMemo(() => {
        let hash = 0;
        if (!userName) return { backgroundColor: '#ccc' };
        for (let i = 0; i < userName.length; i++) {
            hash = userName.charCodeAt(i) + ((hash << 5) - hash);
        }
        const color = `hsl(${hash % 360}, 70%, 50%)`;
        return { backgroundColor: color };
    }, [userName]);

    return (
        <div className="avatar" style={!avatarUrl ? avatarColor : {}}>
            {avatarContent}
        </div>
    );
};

export default Avatar;