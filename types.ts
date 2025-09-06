/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { User } from '@supabase/supabase-js';

// --- INTERFACES Y TIPOS DE TYPESCRIPT ---

// Catálogo Maestro de Productos
export interface Product {
    id: number;
    sku: string;
    nombre: string;
    modelo: string | null;
    marca: string | null;
    categoria: string | null;
    descripcion: string | null;
    precio_base: number;
    imagenes: string[] | null;
    created_at: string;
}

// Inventario por Sucursal
export interface Inventory {
    id_producto: number;
    id_sucursal: number;
    cantidad: number;
    costo_promedio: number;
}

// Precios por Sucursal (para futura implementación de Opción B)
export interface BranchPrice {
    id_producto: number;
    id_sucursal: number;
    precio_venta: number;
}

// Tipo extendido para mostrar productos con su stock total en la UI
export interface ProductWithTotalStock extends Product {
    stock_total: number;
}

// Tipo para el terminal de venta, incluye el stock específico de la sucursal
export interface ProductWithStock extends Product {
    stock: number;
    costo_promedio: number;
}


export interface Branch {
    id: number;
    nombre: string;
    direccion: string | null;
    telefono: string | null;
}

export type UserRole = 'Propietario' | 'Administrador' | 'Empleado';

export interface AppUser {
    id: string;
    nombre: string;
    email: string;
    avatar_link: string | null;
    rol: UserRole;
    id_Sucursal?: number | null; // Necesario para los formularios
    sucursal: {
        nombre: string;
    } | null;
}

export interface Provider {
    id: string; // UUID
    nombre: string;
    contacto_nombre: string | null;
    contacto_email: string | null;
    contacto_telefono: string | null;
    direccion: string | null;
    logo_url: string | null;
    created_at: string;
}

export interface Purchase {
    id: number;
    folio?: string; // Nuevo campo para el folio correlativo
    id_usuario?: string; // ID del usuario que creó la compra
    id_proveedor: string | null;
    id_sucursal: number;
    fecha_compra: string;
    monto_total: number;
    estado: 'Pendiente' | 'Confirmado' | 'Cancelada';
    condicion_pago: 'Contado' | 'Crédito';
    fecha_vencimiento?: string | null;
    tipo_cambio?: number;
    estado_pago?: 'Pago Pendiente' | 'Parcialmente Pagado' | 'Pagado';
    proveedor?: { nombre: string };
    sucursal?: { nombre: string };
    usuario?: { nombre: string }; // Nuevo campo para el nombre del usuario
}

export interface PurchaseItem {
    id_producto: number;
    cantidad: number;
    costo_unitario: number;
    moneda: 'Bs.' | '$';
}

export interface ProductForPurchase extends Product {
    cantidad: number;
    costo_unitario: number;
}

export type PaymentMethod = 'Efectivo' | 'Transferencia' | 'Tarjeta de Débito/Crédito' | 'QR' | 'Otro';

export interface Payment {
  id: number;
  id_compra: number;
  fecha_pago: string;
  monto: number;
  metodo_pago: PaymentMethod;
  notas?: string | null;
  created_at: string;
}

export interface Sale {
    id: number;
    id_sucursal: number;
    id_usuario: string;
    fecha_venta: string;
    monto_total: number;
    metodo_pago: PaymentMethod;
    sucursal?: { nombre: string };
    usuario?: { nombre: string };
}

export interface SaleItem {
    id_venta: number;
    id_producto: number;
    cantidad: number;
    precio_unitario: number;
}

export interface ProductForSale extends Product {
    cantidad: number;
    precio_unitario: number;
    costo_promedio: number;
}


export type Page = 'dashboard' | 'products' | 'sales' | 'purchases' | 'transfers' | 'expenses' | 'branches' | 'users' | 'providers' | 'pos';

export interface InventoryWithBranch {
    id_sucursal: number;
    cantidad: number;
    costo_promedio: number;
    sucursal: {
        nombre: string;
    } | null;
}

// --- INTERFACES PARA PROPS ---
export interface SidebarProps {
    currentPage: Page;
    setCurrentPage: (page: Page) => void;
    profile: AppUser | null;
    isOpen: boolean;
}

export interface HeaderProps {
    user: User;
    profile: AppUser | null;
    setCurrentPage: (page: Page) => void;
    onToggleSidebar: () => void;
}

export interface AvatarProps {
    userName: string;
    avatarUrl: string | null;
}

export interface ProviderAvatarProps {
    providerName: string;
    logoUrl: string | null;
}

export interface ProductsPageProps {
    profile: AppUser | null;
    onProductSelect: (id: number) => void;
}

export interface ProductDetailPageProps {
    productId: number;
    onBack: () => void;
    profile: AppUser | null;
}

export interface ProvidersPageProps {
    profile: AppUser | null;
}

export interface PurchasesPageProps {
    profile: AppUser | null;
    onPurchaseSelect: (id: number) => void;
}

export interface PurchaseDetailPageProps {
    purchaseId: number;
    onBack: () => void;
    profile: AppUser | null;
}

export interface SalesPageProps {
    profile: AppUser | null;
}

export interface TerminalVentaPageProps {
    profile: AppUser | null;
}

export interface SalePaymentModalProps {
    total: number;
    cart: ProductForSale[];
    profile: AppUser | null;
    onClose: () => void;
    onSaleComplete: () => void;
}


export interface PaymentsModalProps {
    purchase: Purchase;
    onClose: () => void;
    onPaymentsUpdate: () => void; // Callback to refresh parent component
}