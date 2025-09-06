/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Formats a number into a currency string with the format "Bs.1,234.56".
 * @param amount The number to format.
 * @param prefix The currency prefix to use. Defaults to 'Bs.'. Pass an empty string for no prefix.
 * @returns The formatted currency string.
 */
export const formatCurrency = (amount: number | null | undefined, prefix: string = 'Bs.'): string => {
    const numericAmount = amount ?? 0;
    // 'en-US' locale gives the desired format: comma for thousands, period for decimal.
    const formatter = new Intl.NumberFormat('en-US', {
        style: 'decimal',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
    const formattedAmount = formatter.format(numericAmount);
    return prefix ? `${prefix}${formattedAmount}` : formattedAmount;
};