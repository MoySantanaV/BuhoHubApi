/**
 * Script de prueba simple para verificar que better-auth esté funcionando
 *
 * Ejecuta: pnpm tsx test-auth.ts
 *
 * Asegúrate de que el servidor esté corriendo primero con: pnpm dev
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

interface TestResult {
    name: string;
    passed: boolean;
    message: string;
}

const tests: TestResult[] = [];

async function testEndpoint(name: string, path: string, expectedStatus?: number) {
    try {
        const response = await fetch(`${BASE_URL}${path}`);
        const status = response.status;

        const passed = expectedStatus ? status === expectedStatus : status < 500;

        tests.push({
            name,
            passed,
            message: `${passed ? '✅' : '❌'} ${name}: Status ${status}${expectedStatus ? ` (esperado: ${expectedStatus})` : ''}`
        });

        return response;
    } catch (error) {
        tests.push({
            name,
            passed: false,
            message: `❌ ${name}: Error - ${error instanceof Error ? error.message : 'Unknown error'}`
        });
        throw error;
    }
}

async function runTests() {
    console.log('🧪 Iniciando pruebas de Better Auth...\n');
    console.log(`📍 URL Base: ${BASE_URL}\n`);

    try {
        // Test 1: Verificar que el servidor esté corriendo
        console.log('1️⃣  Probando conexión al servidor...');
        await testEndpoint('Servidor corriendo', '/', 200);

        // Test 2: Verificar que Better Auth esté funcionando
        console.log('2️⃣  Probando endpoint de Better Auth /ok...');
        const okResponse = await testEndpoint('GET /api/auth/ok', '/api/auth/ok', 200);
        const okData = await okResponse.json();
        console.log('   Respuesta:', JSON.stringify(okData, null, 2));

        // Test 3: Verificar que el endpoint de sesión responda
        console.log('3️⃣  Probando endpoint de sesión...');
        const sessionResponse = await testEndpoint('GET /api/auth/session', '/api/auth/session');
        const sessionData = await sessionResponse.json();
        console.log('   Respuesta:', JSON.stringify(sessionData, null, 2));

        // Test 4: Verificar que el callback de Google OAuth esté disponible
        console.log('4️⃣  Probando disponibilidad de callback Google...');
        await testEndpoint('GET /api/auth/callback/google', '/api/auth/callback/google');

    } catch (error) {
        console.error('\n❌ Error durante las pruebas:', error);
    }

    // Mostrar resumen
    console.log('\n' + '='.repeat(50));
    console.log('📊 RESUMEN DE PRUEBAS');
    console.log('='.repeat(50));

    tests.forEach(test => {
        console.log(test.message);
    });

    const passed = tests.filter(t => t.passed).length;
    const total = tests.length;

    console.log('\n' + '='.repeat(50));
    console.log(`Resultado: ${passed}/${total} pruebas exitosas`);
    console.log('='.repeat(50));

    if (passed === total) {
        console.log('\n✅ ¡Todas las pruebas pasaron! Better Auth está configurado correctamente.');
    } else {
        console.log('\n⚠️  Algunas pruebas fallaron. Revisa la configuración.');
    }
}

// Ejecutar pruebas
runTests().catch(error => {
    console.error('Error fatal:', error);
    process.exit(1);
});
