import mongoose from 'mongoose';
import { env } from './env.js';

export const connectDatabase = async (): Promise<void> => {
	try {
		await mongoose.connect(env.mongodbUri);
		console.log('✅ MongoDB conectado exitosamente');
		console.log(`📦 Base de datos: ${mongoose.connection.name}`);
	} catch (error) {
		console.error('❌ Error conectando a MongoDB:', error);
		process.exit(1);
	}
};

// Manejar eventos de conexión
mongoose.connection.on('disconnected', () => {
	console.log('⚠️  MongoDB desconectado');
});

mongoose.connection.on('error', error => {
	console.error('❌ Error en MongoDB:', error);
});
