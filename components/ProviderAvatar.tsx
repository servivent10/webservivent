/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import { ProviderAvatarProps } from '../types';
import './ProviderAvatar.css';

const ProviderAvatar: React.FC<ProviderAvatarProps> = ({ providerName, logoUrl }) => {
    const getInitials = (name: string) => {
        if (!name) return '?';
        const words = name.split(' ');
        if (words.length > 1) {
            return words.map(w => w[0]).join('').toUpperCase().slice(0, 3);
        }
        return name.slice(0, 2).toUpperCase();
    };

    const avatarContent = useMemo(() => {
        if (logoUrl) {
            return <img src={logoUrl} alt={providerName} className="provider-avatar__image" />;
        }
        return <span className="provider-avatar__initials">{getInitials(providerName)}</span>;
    }, [logoUrl, providerName]);
    
    // Función hash simple para obtener un color a partir del nombre
    const avatarColor = useMemo(() => {
        let hash = 0;
        if (!providerName) return { backgroundColor: '#ccc' };
        for (let i = 0; i < providerName.length; i++) {
            hash = providerName.charCodeAt(i) + ((hash << 5) - hash);
        }
        const color = `hsl(${hash % 360}, 70%, 50%)`;
        return { backgroundColor: color };
    }, [providerName]);

    return (
        <div className="provider-avatar" style={!logoUrl ? avatarColor : {}}>
            {avatarContent}
        </div>
    );
};

export default ProviderAvatar;