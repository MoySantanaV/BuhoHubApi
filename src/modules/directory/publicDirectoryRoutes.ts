import { Router } from 'express';
import { requireDirectoryKey } from './directoryKey.js';
import { getFacets, getProfessional, getSitemapPage, listProfessionals } from './publicDirectoryController.js';

// Solo lectura: aquí NO debe existir ningún POST/PUT/PATCH/DELETE (lo vigila un test).
// La llave se revisa antes que cualquier otra cosa.
const router = Router();

router.use(requireDirectoryKey);
router.get('/professionals', listProfessionals);
router.get('/professionals/:slug', getProfessional);
router.get('/directory/facets', getFacets);
router.get('/directory/sitemap', getSitemapPage);

export default router;
