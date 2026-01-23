/**
 * Sales calculation utilities
 * All calculations are done server-side to ensure accuracy
 */

export interface SaleProduct {
    name: string;
    price: number;
    quantity: number;
    subtotal?: number;
}

export interface CalculatedSale {
    products: Array<{
        name: string;
        price: number;
        quantity: number;
        subtotal: number;
    }>;
    subtotal: number;
    tax: number;
    total: number;
}

const TAX_RATE = 0.16; // 16% IVA

/**
 * Calculate sale totals from products
 * Never trust client-provided totals - always calculate server-side
 */
export const calculateSale = (products: SaleProduct[], hasTax: boolean): CalculatedSale => {
    // Calculate subtotal for each product
    const calculatedProducts = products.map((product) => ({
        name: product.name,
        price: product.price,
        quantity: product.quantity,
        subtotal: product.price * product.quantity,
    }));

    // Calculate total subtotal
    const subtotal = calculatedProducts.reduce((sum, product) => sum + product.subtotal, 0);

    // Calculate tax if applicable
    const tax = hasTax ? subtotal * TAX_RATE : 0;

    // Calculate total
    const total = subtotal + tax;

    return {
        products: calculatedProducts,
        subtotal,
        tax,
        total,
    };
};

/**
 * Get date range for a period
 */
export const getPeriodDateRange = (
    period: 'today' | 'week' | 'month'
): { start: Date; end: Date; periodName: string } => {
    const now = new Date();
    const start = new Date(now);
    const end = new Date(now);

    switch (period) {
        case 'today':
            start.setUTCHours(0, 0, 0, 0);
            end.setUTCHours(23, 59, 59, 999);
            return { start, end, periodName: 'today' };

        case 'week': {
            // Get start of week (Monday)
            const dayOfWeek = now.getUTCDay();
            const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // Adjust for Sunday
            start.setUTCDate(now.getUTCDate() + diff);
            start.setUTCHours(0, 0, 0, 0);

            // End is today
            end.setUTCHours(23, 59, 59, 999);
            return { start, end, periodName: 'week' };
        }

        case 'month':
            // Start of month
            start.setUTCDate(1);
            start.setUTCHours(0, 0, 0, 0);

            // End is today
            end.setUTCHours(23, 59, 59, 999);
            return { start, end, periodName: 'month' };

        default:
            // Default to today
            start.setUTCHours(0, 0, 0, 0);
            end.setUTCHours(23, 59, 59, 999);
            return { start, end, periodName: 'today' };
    }
};
