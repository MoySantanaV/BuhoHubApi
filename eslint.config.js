import js from '@eslint/js';
import prettierRecommended from 'eslint-plugin-prettier/recommended';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    { ignores: ['node_modules/**', 'dist/**', '.vercel/**', 'coverage/**'] },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    // Prettier corre como regla y apaga las reglas de estilo que chocan con él
    prettierRecommended,
    {
        rules: {
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-unused-vars': 'off',
        },
    }
);
