/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { TerminalVentaPageProps, ProductWithStock, ProductForSale, BranchPrice, Branch } from '../types';
import { useToast } from '../contexts/ToastContext';
import { formatCurrency } from '../utils/formatting';
import { SalePaymentModal } from '../components/SalePaymentModal';
import Modal from '../components/Modal';
import './TerminalVentaPage.css';
import '../components/Button.css';

// Extender el tipo para incluir las ventas totales y el inventario de todas las sucursales
type ProductWithSalesData = ProductWithStock & { 
    total_sold: number; 
    created_at: string; 
    inventario_por_sucursal: { id_sucursal: number; cantidad: number; }[];
    precios_por_sucursal: BranchPrice[];
    stock_total_empresa: number;
};

const parseDiscountValue = (discountStr: string, subtotal: number): number => {
    if (!discountStr) return 0;
    const value = parseFloat(discountStr.replace(/[^0-9.]/g, ''));
    if (isNaN(value)) return 0;

    if (discountStr.includes('%')) {
        return (subtotal * value) / 100;
    }
    return value;
};


const TerminalVentaPage: React.FC<TerminalVentaPageProps> = ({ profile }) => {
    const [products, setProducts] = useState<ProductWithSalesData[]>([]);
    const [cart, setCart] = useState<ProductForSale[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(true);
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [taxPercent, setTaxPercent] = useState<number>(0);
    const [discount, setDiscount] = useState('');
    const { addToast } = useToast();

    // Estado para el nuevo modal de información
    const [isInfoModalOpen, setIsInfoModalOpen] = useState(false);
    const [selectedProductForInfo, setSelectedProductForInfo] = useState<ProductWithSalesData | null>(null);
    const [allBranches, setAllBranches] = useState<Branch[]>([]);
    
    const userBranchId = profile?.id_Sucursal;

    const fetchData = useCallback(async () => {
        if (!userBranchId) {
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const productsPromise = supabase.from('Productos').select('id, sku: SKU, nombre: Nombre, modelo: Modelo, marca: Marca, categoria: Categoria, descripcion: Descripcion, precio_base: Precio_base, imagenes: Imagenes, created_at');
            const inventoryPromise = supabase.from('Inventario').select('id_producto, id_sucursal, cantidad, costo_promedio');
            const salesPromise = supabase.from('Detalles_Venta').select('id_producto, cantidad');
            const branchesPromise = supabase.from('Sucursales').select('id, nombre: Nombre');
            const pricesPromise = supabase.from('Precios_Sucursal').select('id_producto, id_sucursal, precio_venta');

            const [
                { data: productsData, error: productsError }, 
                { data: inventoryData, error: inventoryError },
                { data: salesData, error: salesError },
                { data: branchesData, error: branchesError },
                { data: pricesData, error: pricesError }
            ] = await Promise.all([productsPromise, inventoryPromise, salesPromise, branchesPromise, pricesPromise]);

            if (productsError) throw productsError;
            if (inventoryError) throw inventoryError;
            if (salesError) throw salesError;
            if (branchesError) throw branchesError;
            if (pricesError) throw pricesError;
            
            setAllBranches(branchesData as Branch[]);

            const inventoryByProduct = new Map<number, { id_sucursal: number; cantidad: number; costo_promedio: number }[]>();
            inventoryData.forEach(item => {
                if (!inventoryByProduct.has(item.id_producto)) {
                    inventoryByProduct.set(item.id_producto, []);
                }
                inventoryByProduct.get(item.id_producto)!.push({ id_sucursal: item.id_sucursal, cantidad: item.cantidad, costo_promedio: item.costo_promedio });
            });

            const pricesByProduct = new Map<number, BranchPrice[]>();
            pricesData.forEach(item => {
                if (!pricesByProduct.has(item.id_producto)) {
                    pricesByProduct.set(item.id_producto, []);
                }
                pricesByProduct.get(item.id_producto)!.push(item as BranchPrice);
            });

            const salesMap = new Map<number, number>();
            salesData.forEach(item => {
                const currentSales = salesMap.get(item.id_producto) || 0;
                salesMap.set(item.id_producto, currentSales + item.cantidad);
            });
            
            const productsWithDetails = ((productsData as any) || []).map((p: any) => {
                const allInventories = inventoryByProduct.get(p.id) || [];
                const currentBranchInventory = allInventories.find(inv => inv.id_sucursal === userBranchId);
                const stockInCurrentBranch = currentBranchInventory?.cantidad || 0;
                const costInCurrentBranch = currentBranchInventory?.costo_promedio || 0;
                const totalStockAcrossBranches = allInventories.reduce((sum, inv) => sum + inv.cantidad, 0);

                return {
                    ...p, 
                    stock: stockInCurrentBranch,
                    costo_promedio: costInCurrentBranch,
                    total_sold: salesMap.get(p.id) || 0,
                    created_at: p.created_at || new Date().toISOString(),
                    inventario_por_sucursal: allInventories,
                    precios_por_sucursal: pricesByProduct.get(p.id) || [],
                    stock_total_empresa: totalStockAcrossBranches,
                };
            });
            
            setProducts(productsWithDetails);

        } catch (error: any) {
            addToast(`Error al cargar productos: ${error.message}`, 'error');
        } finally {
            setLoading(false);
        }
    }, [userBranchId, addToast]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const { filteredFeatured, filteredOthers } = useMemo(() => {
        // Prioridad 1: Más vendidos que SÍ tienen stock.
        const bestSellersWithStock = products
            .filter(p => p.stock > 0 && p.total_sold > 0)
            .sort((a, b) => b.total_sold - a.total_sold);

        const featuredList: ProductWithSalesData[] = [...bestSellersWithStock];
        const featuredIds = new Set(featuredList.map(p => p.id));

        // Prioridad 2: Si no se llenan los 10 espacios, rellenar con los productos más nuevos que tengan stock.
        if (featuredList.length < 10) {
            const needed = 10 - featuredList.length;
            const newestWithStock = products
                .filter(p => p.stock > 0 && !featuredIds.has(p.id)) // Excluir los ya añadidos
                .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                .slice(0, needed);
            
            featuredList.push(...newestWithStock);
            newestWithStock.forEach(p => featuredIds.add(p.id));
        }

        // Asegurarse de no tener más de 10 destacados.
        const finalFeatured = featuredList.slice(0, 10);
        
        // "Otros" son todos los productos que no quedaron en la lista final de destacados.
        const others = products.filter(p => !featuredIds.has(p.id));

        // Aplicar el término de búsqueda a ambas listas.
        if (!searchTerm) {
            return { filteredFeatured: finalFeatured, filteredOthers: others };
        }
        
        const lower = searchTerm.toLowerCase();
        const filterFn = (p: ProductWithSalesData) =>
            (p.nombre || '').toLowerCase().includes(lower) ||
            (p.sku || '').toLowerCase().includes(lower) ||
            (p.marca || '').toLowerCase().includes(lower);
            
        return {
            filteredFeatured: finalFeatured.filter(filterFn),
            filteredOthers: others.filter(filterFn)
        };
    }, [products, searchTerm]);

    const addToCart = (product: ProductWithStock) => {
        const existingCartItem = cart.find(item => item.id === product.id);
        const currentQtyInCart = existingCartItem?.cantidad || 0;
        
        if (currentQtyInCart + 1 > product.stock) {
            addToast(`Stock insuficiente para "${product.nombre}". Disponible: ${product.stock}`, 'error');
            return;
        }

        if (existingCartItem) {
            setCart(cart.map(item =>
                item.id === product.id ? { ...item, cantidad: item.cantidad + 1 } : item
            ));
        } else {
            setCart([...cart, { ...product, cantidad: 1, precio_unitario: product.precio_base, costo_promedio: product.costo_promedio }]);
        }
    };
    
    const updateCartQuantity = (productId: number, newQuantity: number) => {
        const productInCatalog = products.find(p => p.id === productId);
        if (!productInCatalog) return;

        if (newQuantity > productInCatalog.stock) {
            addToast(`Stock insuficiente. Máximo disponible: ${productInCatalog.stock}`, 'error');
            newQuantity = productInCatalog.stock;
        }
        
        if (newQuantity <= 0) {
            removeFromCart(productId);
        } else {
            setCart(cart.map(item => item.id === productId ? { ...item, cantidad: newQuantity } : item));
        }
    };

    const removeFromCart = (productId: number) => {
        setCart(cart.filter(item => item.id !== productId));
    };
    
    const clearCart = () => {
        setCart([]);
        setDiscount('');
        setTaxPercent(0);
    }

    const { subtotal, discountAmount, subtotalAfterDiscount, taxAmount, total, isDiscountInvalid, maxDiscount } = useMemo(() => {
        const sub = cart.reduce((acc, item) => acc + (item.cantidad * item.precio_unitario), 0);
        const totalCost = cart.reduce((acc, item) => acc + (item.cantidad * item.costo_promedio), 0);
        
        const maxDisc = sub > totalCost ? sub - totalCost : 0;
        
        const discAmount = parseDiscountValue(discount, sub);
        const isInvalid = discAmount > maxDisc;
        
        const subAfterDisc = sub - discAmount;
        const tax = subAfterDisc * (taxPercent / 100);
        const tot = subAfterDisc + tax;
        
        return { 
            subtotal: sub, 
            discountAmount: discAmount,
            subtotalAfterDiscount: subAfterDisc,
            taxAmount: tax, 
            total: tot,
            isDiscountInvalid: isInvalid,
            maxDiscount: maxDisc
        };
    }, [cart, taxPercent, discount]);
    
    const handleSaleComplete = () => {
        addToast('Venta completada con éxito!', 'success');
        clearCart();
        fetchData(); // Recargar datos para actualizar stock
    }

    const openInfoModal = (product: ProductWithSalesData) => {
        setSelectedProductForInfo(product);
        setIsInfoModalOpen(true);
    };

    const closeInfoModal = () => {
        setSelectedProductForInfo(null);
        setIsInfoModalOpen(false);
    };


    if (!userBranchId) {
        return <div className="pos-page__error-state">No tiene una sucursal asignada. Por favor, contacte a un administrador.</div>;
    }

    if (loading) {
        return <div className="pos-page__loading-state">Cargando terminal de venta...</div>;
    }

    const renderProductCard = (product: ProductWithSalesData) => {
        const isOutOfStock = product.stock <= 0;
        return (
            <div 
                key={product.id} 
                className={`pos-page__product-card ${isOutOfStock ? 'pos-page__product-card--out-of-stock' : ''}`}
                onClick={() => !isOutOfStock && addToCart(product)}
                aria-disabled={isOutOfStock}
                role="button"
            >
                <div className="pos-page__product-image-container">
                    <span className={`pos-page__product-stock-badge ${isOutOfStock ? 'pos-page__product-stock-badge--zero' : ''}`}>{product.stock}</span>
                    {product.imagenes && product.imagenes.length > 0 ? (
                        <img src={product.imagenes[0]} alt={product.nombre} />
                    ) : (
                        <span className="material-icons">image_not_supported</span>
                    )}
                     {isOutOfStock && <div className="pos-page__out-of-stock-overlay">Agotado</div>}
                </div>
                <div className="pos-page__product-info">
                    <p className="pos-page__product-name">{product.nombre}</p>
                    <div className="pos-page__price-container">
                        <p className="pos-page__product-price">{formatCurrency(product.precio_base)}</p>
                        {product.stock_total_empresa > 0 && (
                            <button
                                className="pos-page__product-info-btn"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    openInfoModal(product);
                                }}
                                aria-label={`Ver detalles de ${product.nombre}`}
                                title="Ver disponibilidad en otras sucursales"
                            >
                                <span className="material-icons">info_outline</span>
                            </button>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    const renderProductGroups = () => {
        const hasAnyProducts = products.length > 0;
        const searchHasResults = filteredFeatured.length > 0 || filteredOthers.length > 0;
    
        if (!hasAnyProducts) {
            return (
                <div className="pos-page__no-results">
                    <span className="material-icons">inventory_2</span>
                    <p>No hay productos en esta sucursal</p>
                    <span>Añada productos al inventario para empezar a vender.</span>
                </div>
            );
        }
    
        if (searchTerm && !searchHasResults) {
            return (
                <div className="pos-page__no-results">
                    <span className="material-icons">search_off</span>
                    <p>Sin resultados para "{searchTerm}"</p>
                    <span>Intente con otra búsqueda.</span>
                </div>
            );
        }

        return (
            <>
                {filteredFeatured.length > 0 && (
                    <div className="pos-page__product-group">
                        <h4 className="pos-page__group-title">Destacados</h4>
                        <div className="pos-page__group-grid">
                            {filteredFeatured.map(renderProductCard)}
                        </div>
                    </div>
                )}
                
                {filteredOthers.length > 0 && (
                    <div className="pos-page__product-group">
                        <h4 className="pos-page__group-title">Todos los Productos</h4>
                        <div className="pos-page__group-grid">
                            {filteredOthers.map(renderProductCard)}
                        </div>
                    </div>
                )}
            </>
        );
    };

    return (
        <div className="pos-page">
            <div className="pos-page__products-panel">
                <div className="pos-page__search-bar">
                    <span className="material-icons">search</span>
                    <input
                        type="text"
                        placeholder="Buscar productos por nombre, SKU o marca..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>
                <div className="pos-page__product-grid">
                    {renderProductGroups()}
                </div>
            </div>

            <div className="pos-page__cart-panel">
                <div className="pos-page__cart-header">
                    <h3>Orden Actual</h3>
                    <button onClick={clearCart} className="btn-icon" disabled={cart.length === 0} aria-label="Limpiar carrito">
                        <span className="material-icons">delete_sweep</span>
                    </button>
                </div>
                <div className="pos-page__cart-summary">
                    <div className="pos-page__summary-card pos-page__summary-card--centered">
                        <span className="pos-page__summary-label">Subtotal</span>
                        <span className="pos-page__summary-value">{formatCurrency(subtotal)}</span>
                    </div>

                    <div className="pos-page__summary-row">
                        <div className="pos-page__summary-card pos-page__summary-card--interactive pos-page__summary-card--tax">
                            <span className="pos-page__summary-label">Impuestos (%)</span>
                            <div className="pos-page__summary-card-content">
                                <div className="pos-page__input-wrapper">
                                     <input
                                        id="tax-input"
                                        type="number"
                                        title="Ingrese el porcentaje de impuesto"
                                        value={taxPercent}
                                        onChange={e => setTaxPercent(parseFloat(e.target.value) || 0)}
                                        className="pos-page__summary-input"
                                        min="0"
                                    />
                                    <span>%</span>
                                </div>
                                <span className="pos-page__summary-card-amount">{formatCurrency(taxAmount)}</span>
                            </div>
                        </div>

                        <div className={`pos-page__summary-card pos-page__summary-card--interactive pos-page__summary-card--discount ${isDiscountInvalid ? 'pos-page__summary-card--invalid' : ''}`}>
                            <div className="pos-page__discount-header">
                                <span className="pos-page__summary-label">Descuento</span>
                                {isDiscountInvalid && cart.length > 0 && (
                                    <span className="pos-page__discount-warning" id="discount-error-msg">
                                        Max: {formatCurrency(maxDiscount)}
                                    </span>
                                )}
                            </div>
                            <div className="pos-page__summary-card-content">
                                <div className="pos-page__input-wrapper">
                                    <input
                                        id="discount-input"
                                        type="text"
                                        title={`Descuento máximo permitido: ${formatCurrency(maxDiscount)}`}
                                        value={discount}
                                        onChange={e => setDiscount(e.target.value)}
                                        className="pos-page__summary-input"
                                        placeholder="0 o 10%"
                                        aria-invalid={isDiscountInvalid}
                                        aria-describedby={isDiscountInvalid ? "discount-error-msg" : undefined}
                                    />
                                </div>
                                <span className="pos-page__summary-card-amount">-{formatCurrency(discountAmount)}</span>
                            </div>
                        </div>
                    </div>

                    <div className="pos-page__summary-card pos-page__summary-card--total">
                        <span className="pos-page__total-value">{formatCurrency(total)}</span>
                        <button 
                            className="btn btn--primary pos-page__charge-btn" 
                            disabled={cart.length === 0 || isDiscountInvalid}
                            onClick={() => setIsPaymentModalOpen(true)}
                        >
                            <span className="material-icons">payment</span>
                            Cobrar
                        </button>
                    </div>
                </div>
                <div className="pos-page__cart-items">
                    {cart.length > 0 ? (
                        cart.map(item => (
                             <div key={item.id} className="pos-page__cart-item">
                                <div className="pos-page__cart-item-info">
                                    <p className="pos-page__cart-item-name">{item.nombre}</p>
                                    <p className="pos-page__cart-item-price">{formatCurrency(item.precio_unitario)}</p>
                                </div>
                                <div className="pos-page__cart-item-controls">
                                     <button className="btn-icon" onClick={() => updateCartQuantity(item.id, item.cantidad - 1)}>
                                        <span className="material-icons">remove</span>
                                    </button>
                                    <input 
                                        type="number" 
                                        value={item.cantidad}
                                        onChange={(e) => updateCartQuantity(item.id, parseInt(e.target.value) || 1)}
                                        className="pos-page__cart-item-quantity"
                                    />
                                    <button className="btn-icon" onClick={() => updateCartQuantity(item.id, item.cantidad + 1)}>
                                        <span className="material-icons">add</span>
                                    </button>
                                </div>
                                <p className="pos-page__cart-item-subtotal">{formatCurrency(item.cantidad * item.precio_unitario)}</p>
                                <button className="btn-icon" onClick={() => removeFromCart(item.id)}>
                                    <span className="material-icons">delete</span>
                                </button>
                            </div>
                        ))
                    ) : (
                        <div className="pos-page__cart-empty">
                            <span className="material-icons">shopping_cart</span>
                            <p>El carrito está vacío</p>
                        </div>
                    )}
                </div>
            </div>
            
            {isPaymentModalOpen && (
                <SalePaymentModal
                    total={total}
                    cart={cart}
                    profile={profile}
                    onClose={() => setIsPaymentModalOpen(false)}
                    onSaleComplete={handleSaleComplete}
                />
            )}
             {isInfoModalOpen && selectedProductForInfo && (
                <Modal
                    title={selectedProductForInfo.nombre}
                    onClose={closeInfoModal}
                    className="pos-page__info-modal"
                >
                    <div className="modal-body">
                        <div className="pos-page__info-modal-details">
                            <p><strong>SKU:</strong> {selectedProductForInfo.sku}</p>
                            <p><strong>Marca:</strong> {selectedProductForInfo.marca || 'N/A'}</p>
                        </div>
                        <h4>Disponibilidad por Sucursal</h4>
                        <div className="pos-page__info-table-container">
                            <table className="pos-page__info-table table-shared">
                                <thead>
                                    <tr>
                                        <th>Sucursal</th>
                                        <th>Stock</th>
                                        <th>Precio</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {allBranches.map(branch => {
                                        const inventory = selectedProductForInfo.inventario_por_sucursal.find(inv => inv.id_sucursal === branch.id);
                                        const stock = inventory ? inventory.cantidad : 0;
                                        const specificPrice = selectedProductForInfo.precios_por_sucursal.find(p => p.id_sucursal === branch.id);
                                        const price = specificPrice ? specificPrice.precio_venta : selectedProductForInfo.precio_base;
                                        const isCurrentUserBranch = branch.id === userBranchId;

                                        return (
                                            <tr key={branch.id} className={isCurrentUserBranch ? 'pos-page__info-table-current-branch' : ''}>
                                                <td>
                                                    {branch.nombre}
                                                    {isCurrentUserBranch && <span className="pos-page__current-branch-tag"> (Tu Sucursal)</span>}
                                                </td>
                                                <td className={stock <= 0 ? 'pos-page__info-table-no-stock' : ''}>{stock}</td>
                                                <td>{formatCurrency(price)}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                    <div className="modal-footer">
                        <button type="button" onClick={closeInfoModal} className="btn btn--secondary">Cerrar</button>
                    </div>
                </Modal>
            )}
        </div>
    );
};

export default TerminalVentaPage;