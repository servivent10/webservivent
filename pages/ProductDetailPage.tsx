/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../supabaseClient';
import { Product, ProductDetailPageProps, InventoryWithBranch, Branch, BranchPrice } from '../types';
import { useToast } from '../contexts/ToastContext';
import Modal from '../components/Modal';
import { formatCurrency } from '../utils/formatting';
import './ProductDetailPage.css';
import '../components/Table.css';
import '../components/Button.css';

// Tipo combinado para esta página
interface ProductDetail extends Product {
    inventario: InventoryWithBranch[];
}

const ProductDetailPage: React.FC<ProductDetailPageProps> = ({ productId, onBack, profile }) => {
    const [product, setProduct] = useState<ProductDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [selectedImageIndex, setSelectedImageIndex] = useState(0);
    const [isLightboxOpen, setIsLightboxOpen] = useState(false);

    // Estado para el modal de edición
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [currentProductForEdit, setCurrentProductForEdit] = useState<Partial<Product> | null>(null);
    const [imageFiles, setImageFiles] = useState<(File | null)[]>([null, null, null]);
    const [imagePreviews, setImagePreviews] = useState<(string | null)[]>([null, null, null]);
    
    // Estados para el modal de gestión de stock
    const [isStockModalOpen, setIsStockModalOpen] = useState(false);
    const [branches, setBranches] = useState<Branch[]>([]);
    const [selectedBranchId, setSelectedBranchId] = useState<string>('');
    const [stockAmount, setStockAmount] = useState<number>(1);
    const [isStockSaving, setIsStockSaving] = useState(false);

    // Estados para la nueva sección de precios
    const [allBranches, setAllBranches] = useState<Branch[]>([]);
    const [branchPrices, setBranchPrices] = useState<BranchPrice[]>([]);
    const [editableBranchPrices, setEditableBranchPrices] = useState<Map<number, string>>(new Map());
    const [margin, setMargin] = useState<string>('30');
    const [isSavingPrices, setIsSavingPrices] = useState(false);


    const { addToast } = useToast();
    const canManageProducts = profile?.rol === 'Propietario' || profile?.rol === 'Administrador';

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const productPromise = supabase
                .from('Productos')
                .select('id, sku: SKU, nombre: Nombre, modelo: Modelo, marca: Marca, categoria: Categoria, descripcion: Descripcion, precio_base: Precio_base, imagenes: Imagenes, created_at')
                .eq('id', productId)
                .single();
            
            const inventoryPromise = supabase
                .from('Inventario')
                .select('id_sucursal, cantidad, costo_promedio, sucursal:Sucursales(nombre:Nombre)')
                .eq('id_producto', productId);

            const pricesPromise = supabase
                .from('Precios_Sucursal')
                .select('id_producto, id_sucursal, precio_venta')
                .eq('id_producto', productId);

            const allBranchesPromise = supabase
                .from('Sucursales')
                .select('id, nombre: Nombre')
                .order('Nombre');


            const [{ data: productData, error: productError }, { data: inventoryData, error: inventoryError }, { data: pricesData, error: pricesError }, { data: allBranchesData, error: allBranchesError }] = await Promise.all([productPromise, inventoryPromise, pricesPromise, allBranchesPromise]);

            if (productError) throw productError;
            if (inventoryError) throw inventoryError;
            if (pricesError) throw pricesError;
            if (allBranchesError) throw allBranchesError;

            setProduct({
                ...(productData as unknown as Product),
                inventario: (inventoryData as unknown as InventoryWithBranch[])
            });
            
            setBranchPrices(pricesData as BranchPrice[]);
            setAllBranches(allBranchesData as Branch[]);
            
            const priceMap = new Map<number, string>();
            if (pricesData) {
                pricesData.forEach(p => {
                    priceMap.set(p.id_sucursal, String(p.precio_venta));
                });
            }
            setEditableBranchPrices(priceMap);


        } catch (error: any) {
            addToast(`Error al cargar el producto: ${error.message}`, 'error');
            setProduct(null);
        } finally {
            setLoading(false);
        }
    }, [productId, addToast]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);
    
    // --- Lógica de Precios (Calculadora y Guardado) ---
    
    const displayPriceInfo = useMemo(() => {
        if (!product) return { price: 0, label: '' };

        const userBranchId = profile?.id_Sucursal;
        if (userBranchId) {
            const specificPrice = branchPrices.find(p => p.id_sucursal === userBranchId);
            if (specificPrice) {
                return {
                    price: specificPrice.precio_venta,
                    label: `Precio para ${profile?.sucursal?.nombre || 'tu sucursal'}`
                };
            }
        }

        return {
            price: product.precio_base,
            label: 'Precio Base'
        };
    }, [product, branchPrices, profile]);
    
    const weightedAverageCost = useMemo(() => {
        if (!product || product.inventario.length === 0) return 0;
        const totalCost = product.inventario.reduce((acc, item) => acc + (item.cantidad * item.costo_promedio), 0);
        const totalQuantity = product.inventario.reduce((acc, item) => acc + item.cantidad, 0);
        if (totalQuantity === 0) return 0;
        return totalCost / totalQuantity;
    }, [product]);

    const suggestedPrice = useMemo(() => {
        const marginValue = parseFloat(margin);
        if (isNaN(marginValue) || weightedAverageCost === 0) return null;
        return weightedAverageCost * (1 + marginValue / 100);
    }, [weightedAverageCost, margin]);

    const suggestedProfit = useMemo(() => {
        if (suggestedPrice === null || weightedAverageCost === 0) return null;
        return suggestedPrice - weightedAverageCost;
    }, [suggestedPrice, weightedAverageCost]);

    const handleApplySuggestion = async () => {
        if (!product || suggestedPrice === null) return;
        setIsSavingPrices(true);
        try {
            const { error } = await supabase
                .from('Productos')
                .update({ Precio_base: suggestedPrice })
                .eq('id', product.id);
            if (error) throw error;
            addToast('Precio base actualizado con la sugerencia.', 'success');
            await fetchData();
        } catch (error: any) {
            addToast(`Error al aplicar sugerencia: ${error.message}`, 'error');
        } finally {
            setIsSavingPrices(false);
        }
    };

    const handleBranchPriceChange = (branchId: number, value: string) => {
        setEditableBranchPrices(prev => new Map(prev).set(branchId, value));
    };

    const handleSaveBranchPrices = async () => {
        if (!product) return;
        setIsSavingPrices(true);

        const originalPricesMap = new Map(branchPrices.map(p => [p.id_sucursal, p.precio_venta]));
        const recordsToUpsert: Omit<BranchPrice, 'id_producto'>[] = [];
        const branchIdsToDelete: number[] = [];

        allBranches.forEach(branch => {
            const branchId = branch.id;
            const newPriceStr = editableBranchPrices.get(branchId);

            // Si el campo tiene un valor numérico
            if (newPriceStr !== undefined && newPriceStr.trim() !== '') {
                const newPriceNum = parseFloat(newPriceStr);
                if (!isNaN(newPriceNum) && newPriceNum >= 0) {
                    // Solo lo añadimos si es diferente al original para optimizar
                    if (newPriceNum !== originalPricesMap.get(branchId)) {
                        recordsToUpsert.push({
                            id_sucursal: branchId,
                            precio_venta: newPriceNum,
                        });
                    }
                }
            } else {
                // Si el campo está vacío pero antes tenía un precio, hay que eliminarlo
                if (originalPricesMap.has(branchId)) {
                    branchIdsToDelete.push(branchId);
                }
            }
        });

        if (recordsToUpsert.length === 0 && branchIdsToDelete.length === 0) {
            addToast('No hay cambios que guardar.', 'success');
            setIsSavingPrices(false);
            return;
        }

        try {
            const { error, data } = await supabase.functions.invoke('update-branch-prices', {
                body: {
                    productId: product.id,
                    recordsToUpsert,
                    branchIdsToDelete
                },
            });

            if (error) {
                 const functionError = data?.msg || error.message;
                 throw new Error(functionError);
            }
            
            addToast('Precios por sucursal guardados.', 'success');
            
            // Optimistically update the `branchPrices` state from our source of truth,
            // `editableBranchPrices`. This ensures the main price display updates instantly
            // and prevents input fields from being cleared by a refetch with stale data.
            const newBranchPrices: BranchPrice[] = [];
            editableBranchPrices.forEach((priceStr, branchId) => {
                const priceNum = parseFloat(priceStr);
                if (priceStr && !isNaN(priceNum)) {
                    newBranchPrices.push({
                        id_producto: productId,
                        id_sucursal: branchId,
                        precio_venta: priceNum,
                    });
                }
            });
            setBranchPrices(newBranchPrices);

        } catch (error: any) {
            addToast(`Error al guardar precios: ${error.message}`, 'error');
        } finally {
            setIsSavingPrices(false);
        }
    };


    // --- Lógica del Modal de Edición ---

    const openEditModal = () => {
        if (!product) return;
        setCurrentProductForEdit({ ...product });
        const previews = [null, null, null];
        if (product.imagenes) {
            product.imagenes.forEach((url, i) => {
                if (i < 3) previews[i] = url;
            });
        }
        setImagePreviews(previews);
        setImageFiles([null, null, null]); // Resetear archivos
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setCurrentProductForEdit(null);
    };

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>, index: number) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setImageFiles(prev => { const newFiles = [...prev]; newFiles[index] = file; return newFiles; });
            setImagePreviews(prev => { const newPreviews = [...prev]; newPreviews[index] = URL.createObjectURL(file); return newPreviews; });
        }
    };
    
    const removeImage = (index: number) => {
        setImageFiles(prev => { const newFiles = [...prev]; newFiles[index] = null; return newFiles; });
        setImagePreviews(prev => { const newPreviews = [...prev]; newPreviews[index] = null; return newPreviews; });
    };

    const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!currentProductForEdit || !currentProductForEdit.nombre || !currentProductForEdit.sku) {
            addToast("SKU y Nombre son obligatorios.", 'error');
            return;
        }
        setIsSaving(true);
        
        try {
            const finalImageUrls: (string | null)[] = [...imagePreviews];

            const uploadPromises = imageFiles.map(async (file, index) => {
                if (!file) return;
                const filePath = `public/${currentProductForEdit.sku}-img${index}-${Date.now()}.${file.name.split('.').pop()}`;
                const { error: uploadError } = await supabase.storage.from('productos').upload(filePath, file, { upsert: true });
                if (uploadError) throw new Error(`Error al subir imagen #${index + 1}: ${uploadError.message}`);
                const { data: urlData } = supabase.storage.from('productos').getPublicUrl(filePath);
                finalImageUrls[index] = urlData.publicUrl;
            });

            await Promise.all(uploadPromises);
            
            const cleanUrls = finalImageUrls.filter(Boolean).map(url => url!.split('?')[0]);

            const productPayload = {
                SKU: currentProductForEdit.sku,
                Nombre: currentProductForEdit.nombre,
                Modelo: currentProductForEdit.modelo || null,
                Marca: currentProductForEdit.marca || null,
                Categoria: currentProductForEdit.categoria || null,
                Descripcion: currentProductForEdit.descripcion || null,
                Precio_base: currentProductForEdit.precio_base || 0,
                Imagenes: cleanUrls,
            };

            const { error } = await supabase.from('Productos').update(productPayload).eq('id', currentProductForEdit.id!);
            if (error) throw error;

            addToast(`Producto "${productPayload.Nombre}" actualizado correctamente.`, 'success');
            closeModal();
            fetchData(); // Recargar datos de la página
        } catch (error: any) {
            addToast(`Error al guardar: ${error.message}`, 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!product) return;
        if (window.confirm(`¿Está seguro de que desea eliminar "${product.nombre}"? Esta acción no se puede deshacer.`)) {
            try {
                const { error } = await supabase.from('Productos').delete().eq('id', product.id);
                if (error) throw error;
                addToast(`Producto "${product.nombre}" eliminado.`, 'success');
                onBack(); // Volver a la lista después de eliminar
            } catch (error: any) {
                 addToast(`Error al eliminar: ${error.message}`, 'error');
            }
        }
    };
    
    // --- Lógica del Modal de Stock ---
    
    const openStockModal = async () => {
        try {
            const { data, error } = await supabase.from('Sucursales').select('id, nombre: Nombre');
            if (error) throw error;

            setBranches(data as Branch[]);
            if (data && data.length > 0) {
                setSelectedBranchId(String(data[0].id));
            }
            setStockAmount(1); // Resetear a 1
            setIsStockModalOpen(true);
        } catch (error: any) {
            addToast(`Error al cargar sucursales: ${error.message}`, 'error');
        }
    };

    const handleStockSave = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!product || !selectedBranchId || !stockAmount || stockAmount <= 0) {
            addToast('Por favor, seleccione una sucursal y una cantidad válida.', 'error');
            return;
        }
        setIsStockSaving(true);

        try {
            const branchId = parseInt(selectedBranchId, 10);

            const { data: existingInventory, error: selectError } = await supabase
                .from('Inventario')
                .select('cantidad')
                .eq('id_producto', product.id)
                .eq('id_sucursal', branchId)
                .single();

            if (selectError && selectError.code !== 'PGRST116') { // PGRST116: no rows found
                throw selectError;
            }

            if (existingInventory) {
                // Actualizar registro existente
                const newQuantity = existingInventory.cantidad + stockAmount;
                const { error: updateError } = await supabase
                    .from('Inventario')
                    .update({ cantidad: newQuantity })
                    .match({ id_producto: product.id, id_sucursal: branchId });
                if (updateError) throw updateError;
            } else {
                // Insertar nuevo registro
                const { error: insertError } = await supabase
                    .from('Inventario')
                    .insert({ id_producto: product.id, id_sucursal: branchId, cantidad: stockAmount });
                if (insertError) throw insertError;
            }

            addToast('Stock actualizado correctamente.', 'success');
            setIsStockModalOpen(false);
            fetchData(); // Recargar datos
        } catch (error: any) {
            addToast(`Error al guardar stock: ${error.message}`, 'error');
        } finally {
            setIsStockSaving(false);
        }
    };


    const renderCoverImageUploader = () => (
        <div className="product-detail-page__image-upload-container">
            <label>Imagen de Portada</label>
            <div className="product-detail-page__image-preview product-detail-page__image-preview--cover">
                {imagePreviews[0] ? <img src={imagePreviews[0]!} alt="Vista previa de portada" /> : <span className="material-icons">add_a_photo</span>}
            </div>
            <div className="product-detail-page__image-actions">
                <input type="file" id="edit-image-0" className="product-detail-page__visually-hidden" accept="image/*" onChange={(e) => handleImageChange(e, 0)} disabled={isSaving} />
                <label htmlFor="edit-image-0" className="product-detail-page__image-upload-label"><span className="btn btn--secondary"><span className="material-icons">upload</span>Subir</span></label>
                {imagePreviews[0] && <button type="button" onClick={() => removeImage(0)} className="btn btn--danger" disabled={isSaving}><span className="material-icons">delete</span>Quitar</button>}
            </div>
        </div>
    );

    const renderDetailImageUploader = (index: number) => (
        <div className="product-detail-page__detail-image-uploader">
            <div className="product-detail-page__image-preview product-detail-page__image-preview--detail">
                {imagePreviews[index] ? <img src={imagePreviews[index]!} alt={`Preview ${index}`} /> : <span className="material-icons">add_photo_alternate</span>}
            </div>
            <div className="product-detail-page__detail-image-info">
                <label>Imagen de Detalle {index}</label>
                <div className="product-detail-page__image-actions">
                    <input type="file" id={`edit-image-${index}`} className="product-detail-page__visually-hidden" accept="image/*" onChange={(e) => handleImageChange(e, index)} disabled={isSaving} />
                    <label htmlFor={`edit-image-${index}`} className="product-detail-page__image-upload-label"><span className="btn btn--secondary"><span className="material-icons">upload</span></span></label>
                    {imagePreviews[index] && <button type="button" onClick={() => removeImage(index)} className="btn btn--danger" disabled={isSaving}><span className="material-icons">delete</span></button>}
                </div>
            </div>
        </div>
    );

    if (loading) return <div className="loading-container">Cargando detalles del producto...</div>;
    if (!product) return <div>Producto no encontrado. <a onClick={onBack}>Volver a la lista.</a></div>;
    
    const displayImages = product.imagenes || [];
    const mainImage = displayImages[selectedImageIndex] || null;

    return (
        <div className="product-detail-page">
            <div className="product-detail-page__header">
                <div className="product-detail-page__breadcrumbs">
                    <a onClick={onBack}>Productos</a> / <span>{product.nombre}</span>
                </div>
                {canManageProducts && (
                    <div className="product-detail-page__actions">
                        <button onClick={openEditModal} className="btn btn--primary"><span className="material-icons">edit</span>Editar</button>
                        <button onClick={handleDelete} className="btn btn--danger"><span className="material-icons">delete</span>Eliminar</button>
                    </div>
                )}
            </div>

            <div className="product-detail-page__grid">
                <div className="product-detail-page__image-gallery">
                    <div className="product-detail-page__main-image-container" onClick={() => mainImage && setIsLightboxOpen(true)}>
                        {mainImage ? <img src={mainImage} alt={product.nombre} /> : <span className="material-icons">image_not_supported</span>}
                    </div>
                    {displayImages.length > 1 && (
                         <div className="product-detail-page__thumbnail-list">
                            {displayImages.slice(0, 4).map((img, index) => (
                                <div key={index} className={`product-detail-page__thumbnail ${selectedImageIndex === index ? 'product-detail-page__thumbnail--active' : ''}`} onClick={() => setSelectedImageIndex(index)}>
                                    <img src={img} alt={`Thumbnail ${index + 1}`} />
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="product-detail-page__details-column">
                    <div className="product-detail-page__info-card">
                        <p className="product-detail-page__sku">SKU: {product.sku}</p>
                        <h1>{product.nombre}</h1>
                        <div className="product-detail-page__info-pills">
                            {product.marca && <span className="product-detail-page__info-pill">Marca: <strong>{product.marca}</strong></span>}
                            {product.modelo && <span className="product-detail-page__info-pill">Modelo: <strong>{product.modelo}</strong></span>}
                            {product.categoria && <span className="product-detail-page__info-pill">Categoría: <strong>{product.categoria}</strong></span>}
                        </div>
                        <div>
                            <p className="product-detail-page__price">{formatCurrency(displayPriceInfo.price)}</p>
                            {displayPriceInfo.label && <p className="product-detail-page__price-label">({displayPriceInfo.label})</p>}
                        </div>
                        <div className="product-detail-page__section">
                            <h2>Descripción</h2>
                            <div className="product-detail-page__description">
                                {product.descripcion || 'Sin descripción disponible.'}
                            </div>
                        </div>
                    </div>

                    <div className="product-detail-page__inventory-section">
                        <div className="product-detail-page__section-header">
                            <h2>Inventario por Sucursal</h2>
                             {canManageProducts && (
                                <button onClick={openStockModal} className="btn btn--secondary">
                                    <span className="material-icons">add</span>
                                    Añadir Stock
                                </button>
                            )}
                        </div>
                        <div className="product-detail-page__table-container">
                            <table className="product-detail-page__table table-shared">
                                <thead>
                                    <tr>
                                        <th>Sucursal</th>
                                        <th>Cantidad en Stock</th>
                                        <th>Costo Promedio</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {product.inventario.length > 0 ? product.inventario.map(item => (
                                        <tr key={item.id_sucursal}>
                                            <td>{item.sucursal?.nombre || 'Sucursal Desconocida'}</td>
                                            <td>{item.cantidad}</td>
                                            <td>{formatCurrency(item.costo_promedio)}</td>
                                        </tr>
                                    )) : (
                                        <tr>
                                            <td colSpan={3}>No hay datos de inventario para este producto.</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {canManageProducts && (
                        <div className="product-detail-page__pricing-section">
                            <div className="product-detail-page__section-header">
                                <h2>Precios y Márgenes</h2>
                            </div>

                            <div className="product-detail-page__price-calculator">
                                <div className="product-detail-page__calculator-item">
                                    <label>Costo Promedio</label>
                                    <span>{formatCurrency(weightedAverageCost)}</span>
                                </div>
                                <div className="product-detail-page__calculator-item">
                                    <label htmlFor="margin-input">Margen Deseado (%)</label>
                                    <input 
                                        id="margin-input" 
                                        type="number" 
                                        value={margin} 
                                        onChange={(e) => setMargin(e.target.value)}
                                        disabled={isSavingPrices}
                                    />
                                </div>
                                <div className="product-detail-page__calculator-item">
                                    <label>Precio Sugerido</label>
                                    <span className="product-detail-page__suggested-price">{suggestedPrice !== null ? formatCurrency(suggestedPrice) : 'N/A'}</span>
                                </div>
                                <div className="product-detail-page__calculator-item">
                                    <label>Ganancia Estimada</label>
                                    <span className="product-detail-page__suggested-profit">
                                        {suggestedProfit !== null ? formatCurrency(suggestedProfit) : 'N/A'}
                                    </span>
                                </div>
                                <button 
                                    className="btn btn--secondary"
                                    onClick={handleApplySuggestion}
                                    disabled={suggestedPrice === null || isSavingPrices}
                                >
                                    Aplicar al Precio Base
                                </button>
                            </div>

                            <div className="product-detail-page__table-container">
                                <table className="product-detail-page__table table-shared">
                                    <thead>
                                        <tr>
                                            <th>Sucursal</th>
                                            <th>Precio de Venta Específico</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {allBranches.map(branch => (
                                            <tr key={branch.id}>
                                                <td>{branch.nombre}</td>
                                                <td>
                                                    <input 
                                                        type="number"
                                                        step="0.01"
                                                        className="product-detail-page__pricing-table-input"
                                                        placeholder={`(Auto) ${formatCurrency(product.precio_base, '')}`}
                                                        value={editableBranchPrices.get(branch.id) || ''}
                                                        onChange={(e) => handleBranchPriceChange(branch.id, e.target.value)}
                                                        disabled={isSavingPrices}
                                                    />
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <div className="product-detail-page__pricing-actions">
                                <button onClick={handleSaveBranchPrices} className="btn btn--primary" disabled={isSavingPrices}>
                                    {isSavingPrices ? 'Guardando...' : 'Guardar Precios por Sucursal'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
            
            {canManageProducts && isModalOpen && currentProductForEdit && (
                 <Modal title="Editar Producto" onClose={closeModal} className="product-detail-page__modal">
                    <form onSubmit={handleSave}>
                        <div className="modal-body">
                             <div className="product-detail-page__modal-grid">
                                <div className="product-detail-page__modal-image-section">
                                    {renderCoverImageUploader()}
                                    <div className="product-detail-page__detail-images-container">
                                        {renderDetailImageUploader(1)}
                                        {renderDetailImageUploader(2)}
                                    </div>
                                </div>
                                <div className="product-detail-page__modal-form-fields">
                                     <div className="form-group">
                                        <label htmlFor="prod-sku">SKU</label>
                                        <input id="prod-sku" type="text" value={currentProductForEdit.sku || ''} onChange={e => setCurrentProductForEdit({...currentProductForEdit, sku: e.target.value})} required disabled={isSaving} placeholder="(escanee qr, codigo de barra)"/>
                                    </div>
                                    <div className="form-group">
                                        <label htmlFor="prod-nombre">Nombre del Producto</label>
                                        <input id="prod-nombre" type="text" value={currentProductForEdit.nombre || ''} onChange={e => setCurrentProductForEdit({...currentProductForEdit, nombre: e.target.value})} required disabled={isSaving}/>
                                    </div>
                                    <div className="product-detail-page__form-row">
                                        <div className="form-group">
                                            <label htmlFor="prod-marca">Marca</label>
                                            <input id="prod-marca" type="text" value={currentProductForEdit.marca || ''} onChange={e => setCurrentProductForEdit({...currentProductForEdit, marca: e.target.value})} disabled={isSaving}/>
                                        </div>
                                        <div className="form-group">
                                            <label htmlFor="prod-modelo">Modelo</label>
                                            <input id="prod-modelo" type="text" value={currentProductForEdit.modelo || ''} onChange={e => setCurrentProductForEdit({...currentProductForEdit, modelo: e.target.value})} disabled={isSaving}/>
                                        </div>
                                    </div>
                                    <div className="product-detail-page__form-row">
                                        <div className="form-group">
                                            <label htmlFor="prod-categoria">Categoría</label>
                                            <input id="prod-categoria" type="text" value={currentProductForEdit.categoria || ''} onChange={e => setCurrentProductForEdit({...currentProductForEdit, categoria: e.target.value})} disabled={isSaving}/>
                                        </div>
                                        <div className="form-group">
                                            <label htmlFor="prod-precio">Precio Base</label>
                                            <input id="prod-precio" type="number" step="0.01" value={currentProductForEdit.precio_base || 0} onChange={e => setCurrentProductForEdit({...currentProductForEdit, precio_base: parseFloat(e.target.value)})} required disabled={isSaving}/>
                                        </div>
                                    </div>
                                    <div className="form-group">
                                        <label htmlFor="prod-descripcion">Descripción</label>
                                        <textarea id="prod-descripcion" value={currentProductForEdit.descripcion || ''} onChange={e => setCurrentProductForEdit({...currentProductForEdit, descripcion: e.target.value})} rows={3} disabled={isSaving}></textarea>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button type="button" onClick={closeModal} className="btn btn--danger" disabled={isSaving}>Cancelar</button>
                            <button type="submit" className="btn btn--primary" disabled={isSaving}>{isSaving ? 'Guardando...' : 'Guardar Cambios'}</button>
                        </div>
                    </form>
                </Modal>
            )}

            {isLightboxOpen && mainImage && (
                <div className="product-detail-page__lightbox-overlay" onClick={() => setIsLightboxOpen(false)}>
                    <div className="product-detail-page__lightbox-content" onClick={(e) => e.stopPropagation()}>
                        <img src={mainImage} alt={product.nombre} className="product-detail-page__lightbox-image" />
                        <button onClick={() => setIsLightboxOpen(false)} className="product-detail-page__lightbox-close-btn" aria-label="Cerrar imagen">
                            <span className="material-icons">close</span>
                        </button>
                    </div>
                </div>
            )}
            
            {canManageProducts && isStockModalOpen && (
                <Modal title="Añadir Stock a Sucursal" onClose={() => setIsStockModalOpen(false)}>
                    <form onSubmit={handleStockSave}>
                        <div className="modal-body">
                            <div className="form-group">
                                <label htmlFor="stock-branch">Sucursal</label>
                                <select
                                    id="stock-branch"
                                    value={selectedBranchId}
                                    onChange={e => setSelectedBranchId(e.target.value)}
                                    required
                                    disabled={isStockSaving}
                                >
                                    {branches.map(branch => (
                                        <option key={branch.id} value={branch.id}>{branch.nombre}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="form-group">
                                <label htmlFor="stock-amount">Cantidad a Añadir</label>
                                <input
                                    id="stock-amount"
                                    type="number"
                                    min="1"
                                    step="1"
                                    value={stockAmount}
                                    onChange={e => setStockAmount(parseInt(e.target.value, 10) || 1)}
                                    required
                                    disabled={isStockSaving}
                                />
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button type="button" onClick={() => setIsStockModalOpen(false)} className="btn btn--danger" disabled={isStockSaving}>Cancelar</button>
                            <button type="submit" className="btn btn--primary" disabled={isStockSaving}>{isStockSaving ? 'Guardando...' : 'Guardar'}</button>
                        </div>
                    </form>
                </Modal>
            )}
        </div>
    );
};

export default ProductDetailPage;