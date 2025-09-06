/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { SalePaymentModalProps, PaymentMethod } from '../types';
import { useToast } from '../contexts/ToastContext';
import { formatCurrency } from '../utils/formatting';
import Modal from './Modal';
import './SalePaymentModal.css';
import './Button.css';

export const SalePaymentModal: React.FC<SalePaymentModalProps> = ({ total, cart, profile, onClose, onSaleComplete }) => {
    const [amountReceived, setAmountReceived] = useState('');
    const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>('Efectivo');
    const [isSaving, setIsSaving] = useState(false);
    const { addToast } = useToast();

    const paymentMethods: PaymentMethod[] = ['Efectivo', 'Tarjeta de Débito/Crédito', 'QR', 'Transferencia', 'Otro'];

    const change = useMemo(() => {
        const received = parseFloat(amountReceived);
        if (!isNaN(received) && received >= total) {
            return received - total;
        }
        return 0;
    }, [amountReceived, total]);

    // Opciones de dinero rápido: total, siguiente múltiplo de 5, 10, etc.
    // Se filtran duplicados y valores menores al total.
    const quickCashOptions = useMemo(() => {
        const options = new Set<number>();
        options.add(Math.ceil(total));
        if (total % 10 !== 0) options.add(Math.ceil(total / 10) * 10);
        if (total % 50 !== 0) options.add(Math.ceil(total / 50) * 50);
        if (total % 100 !== 0) options.add(Math.ceil(total / 100) * 100);
        
        return Array.from(options)
            .filter(v => v >= total)
            .sort((a,b) => a - b)
            .slice(0, 4);

    }, [total]);
    
     useEffect(() => {
        // Establecer el monto exacto como valor por defecto al abrir.
        setAmountReceived(total.toFixed(2));
    }, [total]);


    const handleFinalizeSale = async () => {
        if (!profile || !profile.id_Sucursal || !profile.id) {
            addToast("Error: No se pudo identificar al usuario o sucursal.", 'error');
            return;
        }
        
        setIsSaving(true);
        try {
            const salePayload = {
                id_sucursal: profile.id_Sucursal,
                id_usuario: profile.id,
                monto_total: total,
                metodo_pago: selectedMethod,
                items: cart.map(item => ({
                    id_producto: item.id,
                    cantidad: item.cantidad,
                    precio_unitario: item.precio_unitario
                }))
            };

            const { data, error } = await supabase.functions.invoke('create-sale', {
                body: salePayload,
            });

            if (error) {
                throw new Error(data?.msg || error.message);
            }

            onSaleComplete();
            onClose();

        } catch (error: any) {
            addToast(`Error al finalizar la venta: ${error.message}`, 'error');
        } finally {
            setIsSaving(false);
        }
    };
    
    const canFinalize = useMemo(() => {
        const received = parseFloat(amountReceived);
        return !isNaN(received) && received >= total;
    }, [amountReceived, total]);

    return (
        <Modal title="Finalizar Venta" onClose={onClose} className="sale-payment-modal">
            <div className="modal-body">
                <div className="sale-payment-modal__summary">
                    <span className="label">Total a Pagar</span>
                    <span className="value">{formatCurrency(total)}</span>
                </div>

                <div className="form-group">
                    <label htmlFor="amount-received">Monto Recibido</label>
                    <input
                        id="amount-received"
                        type="number"
                        step="0.01"
                        placeholder={formatCurrency(total, '')}
                        value={amountReceived}
                        onChange={e => setAmountReceived(e.target.value)}
                        disabled={isSaving}
                        autoFocus
                    />
                </div>
                
                {selectedMethod === 'Efectivo' && quickCashOptions.length > 0 && (
                     <div className="sale-payment-modal__quick-cash">
                        {quickCashOptions.map(amount => (
                            <button 
                                key={amount} 
                                className="btn btn--secondary"
                                onClick={() => setAmountReceived(String(amount.toFixed(2)))}
                                disabled={isSaving}
                            >
                                {formatCurrency(amount)}
                            </button>
                        ))}
                    </div>
                )}

                {change > 0 && (
                    <div className="sale-payment-modal__change">
                        <span className="label">Vuelto</span>
                        <span className="value">{formatCurrency(change)}</span>
                    </div>
                )}
                
                <div className="form-group">
                    <label>Método de Pago</label>
                    <div className="sale-payment-modal__payment-methods">
                        {paymentMethods.map(method => (
                            <button
                                key={method}
                                className={`btn ${selectedMethod === method ? 'btn--primary' : 'btn--secondary'}`}
                                onClick={() => setSelectedMethod(method)}
                                disabled={isSaving}
                            >
                                {method}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
            <div className="modal-footer">
                <button type="button" onClick={onClose} className="btn btn--danger" disabled={isSaving}>Cancelar</button>
                <button 
                    type="button" 
                    className="btn btn--primary" 
                    onClick={handleFinalizeSale}
                    disabled={isSaving || !canFinalize}
                >
                    {isSaving ? 'Procesando...' : 'Finalizar Venta'}
                </button>
            </div>
        </Modal>
    );
};
