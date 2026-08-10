/**
 * ESLint flat configuration.
 *
 * Beyond ordinary code quality, this configuration mechanically enforces the
 * layer boundaries defined in planning/DEPENDENCIES.md:
 *
 *   UI -> Controllers -> Services -> Core Protocol -> Repositories -> Adapters
 *
 * Dependencies may only flow downward. Each layer below declares the imports it
 * is forbidden from making; violations fail `npm run lint`.
 */
const expoConfig = require('eslint-config-expo/flat');
const prettierConfig = require('eslint-config-prettier');

/** Import groups reused across layer rules. */
const PLATFORM = ['react', 'react-dom', 'react-native', 'react-native-*', 'expo', 'expo-*'];
const UI_LAYER = [
  '@components/*',
  '@screens/*',
  '@navigation/*',
  '@/components/*',
  '@/screens/*',
  '@/navigation/*',
];
const CONTROLLER_LAYER = ['@controllers/*', '@/controllers/*'];
const SERVICE_LAYER = ['@services/*', '@/services/*'];
const CORE_LAYER = ['@core/*', '@/core/*'];

/**
 * The core layer minus its two shared declarations.
 *
 * Adapters may reach exactly two things inside core, and nothing else:
 *
 * - `@core/errors` — adapters are required to throw standardized errors rather
 *   than leak platform exceptions (docs/API_SPEC.md §12).
 * - `@core/contracts` — pure interface declarations with no implementation.
 *   They exist to be depended upon from any layer; that is the whole point of
 *   declaring them separately from the modules that use them. An adapter
 *   taking a `Clock`, or implementing a `PacketCodec`, is the intended
 *   direction, not a violation.
 *
 * Everything else in core stays out of reach. Negations override earlier
 * patterns, so the order here matters.
 */
const CORE_LAYER_EXCEPT_SHARED = [
  '@core/*',
  '!@core/errors',
  '!@core/contracts',
  '@/core/*',
  '!@/core/errors',
  '!@/core/contracts',
];
const REPOSITORY_LAYER = ['@repositories/*', '@/repositories/*'];
const ADAPTER_LAYER = ['@storage/*', '@camera/*', '@qr/*', '@/storage/*', '@/camera/*', '@/qr/*'];

/**
 * Builds a `no-restricted-imports` rule entry for a layer.
 *
 * @param {string} layer Human readable layer name, used in the error message.
 * @param {string[]} forbidden Import path globs the layer may not depend on.
 */
function boundary(layer, forbidden) {
  return [
    'error',
    {
      patterns: [
        {
          group: forbidden,
          message: `Layer violation: ${layer} may not import this module. See planning/DEPENDENCIES.md.`,
        },
      ],
    },
  ];
}

module.exports = [
  ...expoConfig,
  prettierConfig,

  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'coverage/**',
      '.expo/**',
      'android/**',
      'ios/**',
      'expo-env.d.ts',
    ],
  },

  {
    // `eslint-config-expo` already registers the `import` plugin; re-registering
    // it is a flat-config error, so only rules and settings are declared here.
    files: ['**/*.{ts,tsx,js,jsx}'],
    settings: {
      'import/resolver': {
        typescript: { project: './tsconfig.json' },
      },
    },
    rules: {
      'import/no-cycle': ['error', { maxDepth: Infinity, ignoreExternal: true }],
      'import/no-self-import': 'error',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'prefer-const': 'error',
      'no-var': 'error',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
    },
  },

  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],

      /**
       * Off deliberately.
       *
       * Every enumeration in this codebase is declared as a frozen object plus
       * a type of the same name — the pattern chosen over `enum` because it
       * erases to plain values. The rule flags each one, which is forty-odd
       * warnings for an idiom that is used on purpose. An accidental
       * redeclaration is still caught: TypeScript reports it as a duplicate
       * identifier, which fails `npm run typecheck` outright.
       */
      '@typescript-eslint/no-redeclare': 'off',
    },
  },

  // ---- Layer boundaries -----------------------------------------------------

  {
    // UI: routes, screens and components may only reach downward to controllers,
    // state, navigation and shared components.
    files: ['app/**/*.{ts,tsx}', 'src/screens/**/*.{ts,tsx}', 'src/components/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': boundary('UI', [
        ...CORE_LAYER,
        ...SERVICE_LAYER,
        ...REPOSITORY_LAYER,
        ...ADAPTER_LAYER,
        '@workers/*',
        '@/workers/*',
      ]),
    },
  },

  {
    // Controllers coordinate services; they never touch React or platform APIs.
    files: ['src/controllers/**/*.ts'],
    rules: {
      'no-restricted-imports': boundary('Controllers', [...PLATFORM, ...UI_LAYER]),
    },
  },

  {
    // Services encapsulate business behaviour over core protocol + repositories.
    files: ['src/services/**/*.ts'],
    rules: {
      'no-restricted-imports': boundary('Services', [
        ...UI_LAYER,
        ...CONTROLLER_LAYER,
        'react',
        'react-dom',
        'react-native',
        'react-native-*',
      ]),
    },
  },

  {
    // Core protocol stays platform independent and dependency light.
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': boundary('Core Protocol', [
        ...PLATFORM,
        ...UI_LAYER,
        ...CONTROLLER_LAYER,
        ...SERVICE_LAYER,
        ...REPOSITORY_LAYER,
        ...ADAPTER_LAYER,
        '@state/*',
        '@hooks/*',
        '@/state/*',
        '@/hooks/*',
        // DEPENDENCIES.md §4 allows the core only domain models and utilities.
        // A logger is a side-effecting collaborator: inject it, don't import it.
        '@telemetry/*',
        '@/telemetry/*',
        '@events/*',
        '@/events/*',
      ]),
    },
  },

  {
    // Repositories own persistence and speak only to storage adapters.
    files: ['src/repositories/**/*.ts'],
    rules: {
      'no-restricted-imports': boundary('Repositories', [
        ...UI_LAYER,
        ...CONTROLLER_LAYER,
        ...SERVICE_LAYER,
        'react',
        'react-dom',
        'react-native',
        'react-native-*',
      ]),
    },
  },

  {
    // Adapters isolate platform APIs; they must stay free of business logic.
    files: ['src/storage/**/*.ts', 'src/camera/**/*.ts', 'src/qr/**/*.ts'],
    rules: {
      'no-restricted-imports': boundary('Adapters', [
        ...UI_LAYER,
        ...CONTROLLER_LAYER,
        ...SERVICE_LAYER,
        ...REPOSITORY_LAYER,
        ...CORE_LAYER_EXCEPT_SHARED,
      ]),
    },
  },

  {
    files: ['tests/**/*.{ts,tsx}', '**/*.test.{ts,tsx}', 'scripts/**/*.{ts,js}'],
    rules: {
      'no-restricted-imports': 'off',
      'no-console': 'off',
    },
  },
];
