/**
 * Lista central de categorías del directorio: única fuente de verdad (la app la consulta por API).
 * El `id` es también el `slug` de la URL pública: una vez publicado NO se cambia (Google ya lo indexó).
 * Para agregar una categoría basta con sumar una fila; no hay que migrar datos.
 */
export interface ProfessionCategory {
    id: string;
    label: string;
    group: string;
    // Sinónimos para el buscador de la app y para reconocer lo que la gente escribe
    aliases: string[];
    // Tipo de schema.org para los datos estructurados de la página pública
    schemaType: string;
}

export const OTHER_CATEGORY_ID = 'otro';

type Row = [id: string, label: string, aliases: string[], schemaType?: string];

const GROUPS: { group: string; schemaType: string; rows: Row[] }[] = [
    {
        group: 'Belleza y cuidado personal',
        schemaType: 'HealthAndBeautyBusiness',
        rows: [
            ['barberia', 'Barbería', ['barbero', 'barber', 'barber shop', 'corte de caballero'], 'BarberShop'],
            [
                'peluqueria',
                'Peluquería y estilismo',
                ['estilista', 'peluquero', 'peluquera', 'salon de belleza', 'cortes', 'tintes'],
                'HairSalon',
            ],
            ['unas', 'Uñas y manicure', ['manicurista', 'manicure', 'pedicure', 'nail', 'acrilico'], 'NailSalon'],
            [
                'estetica',
                'Estética y cosmetología',
                ['cosmetologa', 'cosmetologo', 'facial', 'limpieza facial', 'esteticista'],
                'BeautySalon',
            ],
            ['maquillaje', 'Maquillaje', ['maquillista', 'makeup']],
            ['depilacion', 'Depilación', ['cera', 'laser', 'depilacion laser']],
            ['tatuajes', 'Tatuajes y piercing', ['tatuador', 'tatuadora', 'piercing', 'tattoo']],
            ['cejas-pestanas', 'Cejas y pestañas', ['lashista', 'microblading', 'pestañas', 'cejas']],
        ],
    },
    {
        group: 'Salud',
        schemaType: 'MedicalBusiness',
        rows: [
            ['odontologia', 'Odontología', ['dentista', 'odontologo', 'odontologa', 'ortodoncia', 'dental'], 'Dentist'],
            [
                'medicina-general',
                'Medicina general',
                ['medico', 'doctor', 'doctora', 'consultorio', 'medico general'],
                'Physician',
            ],
            ['pediatria', 'Pediatría', ['pediatra'], 'Physician'],
            ['ginecologia', 'Ginecología', ['ginecologo', 'ginecologa', 'obstetra'], 'Physician'],
            ['dermatologia', 'Dermatología', ['dermatologo', 'dermatologa'], 'Physician'],
            ['oftalmologia', 'Oftalmología y óptica', ['oftalmologo', 'optometrista', 'optica', 'lentes'], 'Optician'],
            ['psicologia', 'Psicología', ['psicologo', 'psicologa', 'terapeuta', 'terapia'], 'MedicalBusiness'],
            ['psiquiatria', 'Psiquiatría', ['psiquiatra'], 'Physician'],
            ['nutricion', 'Nutrición', ['nutriologo', 'nutriologa', 'nutriólogo', 'dietista'], 'MedicalBusiness'],
            [
                'fisioterapia',
                'Fisioterapia y rehabilitación',
                ['fisioterapeuta', 'terapia fisica', 'rehabilitacion'],
                'PhysicalTherapy',
            ],
            ['quiropractica', 'Quiropráctica', ['quiropractico', 'quiropractor']],
            ['podologia', 'Podología', ['podologo', 'podologa', 'pedicurista clinico']],
            ['enfermeria', 'Enfermería a domicilio', ['enfermero', 'enfermera', 'cuidador']],
            ['laboratorio', 'Laboratorio clínico', ['laboratorio', 'analisis clinicos', 'toma de muestras']],
            [
                'medicina-alternativa',
                'Acupuntura y medicina alternativa',
                ['acupunturista', 'homeopata', 'naturista', 'acupuntura'],
            ],
        ],
    },
    {
        group: 'Bienestar y deporte',
        schemaType: 'HealthAndBeautyBusiness',
        rows: [
            ['spa-masajes', 'Spa y masajes', ['masajista', 'masaje', 'spa', 'masajes'], 'DaySpa'],
            [
                'entrenador',
                'Entrenador personal',
                ['personal trainer', 'coach fitness', 'gimnasio', 'entrenador'],
                'SportsActivityLocation',
            ],
            ['yoga-pilates', 'Yoga y pilates', ['yoga', 'pilates', 'instructor de yoga'], 'SportsActivityLocation'],
            [
                'artes-marciales',
                'Artes marciales',
                ['karate', 'taekwondo', 'box', 'jiu jitsu', 'judo'],
                'SportsActivityLocation',
            ],
            ['danza', 'Danza', ['baile', 'bailarin', 'zumba', 'ballet']],
            ['coaching', 'Coaching', ['coach', 'coach de vida', 'mentor']],
        ],
    },
    {
        group: 'Mascotas',
        schemaType: 'LocalBusiness',
        rows: [
            [
                'veterinaria',
                'Veterinaria',
                ['veterinario', 'veterinaria', 'mvz', 'medico veterinario'],
                'VeterinaryCare',
            ],
            ['estetica-canina', 'Estética canina', ['grooming', 'peluqueria canina', 'baño de perros']],
            ['entrenamiento-canino', 'Entrenamiento canino', ['adiestrador', 'adiestramiento', 'entrenador de perros']],
            [
                'guarderia-mascotas',
                'Paseo y guardería de mascotas',
                ['paseador de perros', 'pet sitter', 'guarderia canina'],
            ],
        ],
    },
    {
        group: 'Hogar y oficios',
        schemaType: 'HomeAndConstructionBusiness',
        rows: [
            ['plomeria', 'Plomería', ['plomero', 'fontanero', 'fugas', 'tuberias'], 'Plumber'],
            ['electricidad', 'Electricidad', ['electricista', 'instalaciones electricas'], 'Electrician'],
            ['carpinteria', 'Carpintería', ['carpintero', 'muebles', 'ebanista']],
            ['herreria', 'Herrería', ['herrero', 'soldador', 'portones']],
            ['pintura', 'Pintura', ['pintor', 'pintura de casas'], 'HousePainter'],
            [
                'albanileria',
                'Albañilería',
                ['albañil', 'construccion', 'maestro de obra', 'remodelacion'],
                'GeneralContractor',
            ],
            ['cerrajeria', 'Cerrajería', ['cerrajero', 'llaves', 'chapas'], 'Locksmith'],
            ['jardineria', 'Jardinería', ['jardinero', 'poda', 'paisajismo']],
            ['limpieza', 'Limpieza', ['aseo', 'limpieza de casas', 'servicio domestico', 'lavanderia']],
            ['fumigacion', 'Fumigación', ['fumigador', 'plagas', 'control de plagas']],
            [
                'aire-acondicionado',
                'Aire acondicionado y refrigeración',
                ['minisplit', 'clima', 'refrigeracion', 'tecnico de aires'],
                'HVACBusiness',
            ],
            [
                'electrodomesticos',
                'Reparación de electrodomésticos',
                ['lavadoras', 'refrigeradores', 'tecnico de electrodomesticos'],
            ],
            ['gas', 'Instalación de gas', ['gasero', 'instalador de gas', 'boiler', 'calentador']],
            [
                'impermeabilizacion',
                'Impermeabilización',
                ['impermeabilizante', 'goteras', 'techos'],
                'RoofingContractor',
            ],
            ['mudanzas', 'Mudanzas', ['fletes', 'acarreos', 'mudanza'], 'MovingCompany'],
        ],
    },
    {
        group: 'Autos',
        schemaType: 'AutomotiveBusiness',
        rows: [
            ['mecanica', 'Mecánica', ['mecanico', 'taller mecanico', 'afinacion'], 'AutoRepair'],
            [
                'hojalateria-pintura',
                'Hojalatería y pintura',
                ['hojalatero', 'pintura automotriz', 'carroceria'],
                'AutoBodyShop',
            ],
            ['autolavado', 'Autolavado y detallado', ['lavado de autos', 'detailing', 'detallado'], 'AutoWash'],
            ['llantas', 'Llantas', ['vulcanizadora', 'llantera', 'alineacion y balanceo'], 'TireShop'],
            ['electricidad-automotriz', 'Electricidad automotriz', ['electrico automotriz', 'electricista de autos']],
        ],
    },
    {
        group: 'Tecnología',
        schemaType: 'LocalBusiness',
        rows: [
            [
                'reparacion-electronica',
                'Reparación de celulares y computadoras',
                ['tecnico en computo', 'reparacion de celulares', 'soporte tecnico', 'computadoras'],
            ],
            ['redes-seguridad', 'Redes y cámaras de seguridad', ['camaras', 'cctv', 'instalador de camaras', 'redes']],
            ['diseno-web', 'Diseño web', ['paginas web', 'desarrollador web', 'diseño grafico']],
            [
                'desarrollo-software',
                'Desarrollo de software',
                [
                    'programador',
                    'desarrollador de software',
                    'aplicaciones moviles',
                    'apps',
                    'software a la medida',
                    'ingeniero de software',
                ],
            ],
        ],
    },
    {
        group: 'Educación y asesoría',
        schemaType: 'ProfessionalService',
        rows: [
            ['clases-particulares', 'Clases particulares', ['maestro particular', 'tutor', 'regularizacion', 'tareas']],
            ['idiomas', 'Idiomas', ['ingles', 'profesor de ingles', 'frances', 'aleman', 'traductor']],
            ['musica', 'Música', ['maestro de musica', 'guitarra', 'piano', 'clases de canto']],
            [
                'contabilidad',
                'Contabilidad y fiscal',
                ['contador', 'contadora', 'declaraciones', 'sat', 'fiscal'],
                'AccountingService',
            ],
            [
                'abogacia',
                'Abogacía',
                ['abogado', 'abogada', 'licenciado en derecho', 'despacho juridico'],
                'LegalService',
            ],
            [
                'arquitectura',
                'Arquitectura y diseño de interiores',
                ['arquitecto', 'arquitecta', 'diseñador de interiores', 'interiorismo'],
            ],
            ['notaria-tramites', 'Notaría y trámites', ['notario', 'gestor', 'tramites', 'gestoria'], 'Notary'],
        ],
    },
    {
        group: 'Eventos y creativos',
        schemaType: 'LocalBusiness',
        rows: [
            [
                'fotografia-video',
                'Fotografía y video',
                ['fotografo', 'fotografa', 'videografo', 'camarografo'],
                'Photographer',
            ],
            ['dj-musica-vivo', 'DJ y música en vivo', ['dj', 'mariachi', 'banda', 'sonido', 'grupo musical']],
            ['banquetes', 'Banquetes y catering', ['catering', 'taquiza', 'cocinera', 'chef a domicilio', 'banquete']],
            [
                'decoracion-eventos',
                'Decoración y mobiliario',
                ['decorador', 'renta de mobiliario', 'globos', 'eventos', 'mesas y sillas'],
            ],
            ['pasteleria', 'Pastelería', ['pastelero', 'repostera', 'pasteles', 'reposteria', 'panadero'], 'Bakery'],
            ['animacion-infantil', 'Animación infantil', ['payaso', 'fiestas infantiles', 'animador', 'brincolines']],
        ],
    },
];

export const PROFESSION_CATEGORIES: ProfessionCategory[] = [
    ...GROUPS.flatMap(({ group, schemaType, rows }) =>
        rows.map(([id, label, aliases, rowSchemaType]) => ({
            id,
            label,
            group,
            aliases,
            schemaType: rowSchemaType ?? schemaType,
        }))
    ),
    { id: OTHER_CATEGORY_ID, label: 'Otros servicios', group: 'Otros', aliases: [], schemaType: 'LocalBusiness' },
];

const BY_ID = new Map(PROFESSION_CATEGORIES.map((category) => [category.id, category]));

export const findCategory = (id: unknown): ProfessionCategory | undefined =>
    typeof id === 'string' ? BY_ID.get(id) : undefined;

/** Minúsculas, sin acentos, sin símbolos y con espacios colapsados: "Plomería  Ñandú!" → "plomeria nandu". */
export const normalizeText = (value: string): string =>
    value
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();

// Texto normalizado (etiqueta, id o sinónimo) → categoría; se calcula una sola vez
const BY_TERM = new Map<string, ProfessionCategory>();
for (const category of PROFESSION_CATEGORIES) {
    if (category.id === OTHER_CATEGORY_ID) continue;
    for (const term of [category.label, category.id, ...category.aliases]) {
        const key = normalizeText(term);
        if (key && !BY_TERM.has(key)) BY_TERM.set(key, category);
    }
}

/** Categoría que coincide EXACTAMENTE con lo escrito (etiqueta, id o sinónimo), sin importar acentos. */
export const matchCategory = (text: string): ProfessionCategory | undefined => BY_TERM.get(normalizeText(text));
