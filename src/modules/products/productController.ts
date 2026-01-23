import { Request, Response } from 'express';
import Product from './productModel.js';

/**
 * Get all products for the authenticated user
 * Query params: search, sortBy, order
 */
export const getAllProducts = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req.user as any)._id;
        const { search, sortBy = 'name', order = 'asc' } = req.query;

        // Build query
        const query: any = { userId };

        // Add search filter if provided
        if (search) {
            query.name = { $regex: search, $options: 'i' }; // Case-insensitive search
        }

        // Build sort object
        const sortOrder = order === 'desc' ? -1 : 1;
        const sortField = sortBy === 'price' ? 'price' : 'name';
        const sort: any = { [sortField]: sortOrder };

        // Execute query
        const products = await Product.find(query).sort(sort).lean();

        // Format response
        const formattedProducts = products.map((product) => ({
            id: product._id.toString(),
            name: product.name,
            price: product.price,
        }));

        res.json(formattedProducts);
    } catch (error) {
        console.error('Error getting products:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener productos',
        });
    }
};

/**
 * Create a new product
 */
export const createProduct = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req.user as any)._id;
        const { name, price } = req.body;

        // Validate required fields
        if (!name || name.trim() === '') {
            res.status(400).json({
                success: false,
                message: 'El nombre es requerido',
                errors: [{ field: 'name', message: 'El nombre es requerido' }],
            });
            return;
        }

        if (price === undefined || price === null) {
            res.status(400).json({
                success: false,
                message: 'El precio es requerido',
                errors: [{ field: 'price', message: 'El precio es requerido' }],
            });
            return;
        }

        if (price < 0) {
            res.status(400).json({
                success: false,
                message: 'El precio debe ser mayor o igual a 0',
                errors: [{ field: 'price', message: 'El precio debe ser mayor o igual a 0' }],
            });
            return;
        }

        // Create product
        const product = await Product.create({
            userId,
            name: name.trim(),
            price,
        });

        // Format response
        res.status(201).json({
            id: product._id.toString(),
            name: product.name,
            price: product.price,
        });
    } catch (error) {
        console.error('Error creating product:', error);
        res.status(500).json({
            success: false,
            message: 'Error al crear producto',
        });
    }
};

/**
 * Update a product
 */
export const updateProduct = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req.user as any)._id;
        const { id } = req.params;
        const { name, price } = req.body;

        // Validate input
        if (name !== undefined && name.trim() === '') {
            res.status(400).json({
                success: false,
                message: 'El nombre no puede estar vacío',
                errors: [{ field: 'name', message: 'El nombre no puede estar vacío' }],
            });
            return;
        }

        if (price !== undefined && price < 0) {
            res.status(400).json({
                success: false,
                message: 'El precio debe ser mayor o igual a 0',
                errors: [{ field: 'price', message: 'El precio debe ser mayor o igual a 0' }],
            });
            return;
        }

        // Find and update product (only if belongs to user)
        const product = await Product.findOneAndUpdate(
            { _id: id, userId },
            {
                ...(name !== undefined && { name: name.trim() }),
                ...(price !== undefined && { price }),
            },
            { new: true }
        );

        if (!product) {
            res.status(404).json({
                success: false,
                message: 'Producto no encontrado',
            });
            return;
        }

        // Format response
        res.json({
            id: product._id.toString(),
            name: product.name,
            price: product.price,
        });
    } catch (error) {
        console.error('Error updating product:', error);
        res.status(500).json({
            success: false,
            message: 'Error al actualizar producto',
        });
    }
};

/**
 * Delete a product
 */
export const deleteProduct = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req.user as any)._id;
        const { id } = req.params;

        // Find and delete product (only if belongs to user)
        const product = await Product.findOneAndDelete({ _id: id, userId });

        if (!product) {
            res.status(404).json({
                success: false,
                message: 'Producto no encontrado',
            });
            return;
        }

        res.status(204).send();
    } catch (error) {
        console.error('Error deleting product:', error);
        res.status(500).json({
            success: false,
            message: 'Error al eliminar producto',
        });
    }
};
