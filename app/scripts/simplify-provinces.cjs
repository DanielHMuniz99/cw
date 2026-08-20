#!/usr/bin/env node

/**
 * Simplifica polígonos de provincias removendo vértices muito próximos.
 *
 * Uso:
 *   node simplify-provinces.js <input.json> <output.json> [tolerancia]
 *
 * Exemplo:
 *   node simplify-provinces.js mapa.json mapa-limpo.json 2
 */

const fs = require('fs');
const path = require('path');

function distance(p1, p2) {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Remove vértices consecutivos que estão a menos de `tolerance` de distância.
 * Mantém o primeiro e o último ponto (importante para polígonos).
 */
function simplifyVertices(vertices, tolerance) {
  if (!Array.isArray(vertices) || vertices.length <= 2) {
    return vertices;
  }

  const result = [vertices[0]];

  for (let i = 1; i < vertices.length - 1; i++) {
    const lastKept = result[result.length - 1];
    if (distance(vertices[i], lastKept) >= tolerance) {
      result.push(vertices[i]);
    }
  }

  // Sempre mantém o último ponto
  const last = vertices[vertices.length - 1];
  const lastKept = result[result.length - 1];

  // Só adiciona o último se ele for suficientemente diferente do último mantido
  // (e também do primeiro, caso o polígono esteja fechado)
  if (distance(last, lastKept) >= tolerance) {
    result.push(last);
  } else if (result.length === 1) {
    // Caso extremo: só sobrou 1 ponto
    result.push(last);
  }

  return result;
}

function processProvinces(data, tolerance) {
  if (!data.provinces || !Array.isArray(data.provinces)) {
    throw new Error('JSON inválido: propriedade "provinces" não encontrada ou não é array');
  }

  let totalOriginal = 0;
  let totalSimplified = 0;

  const simplifiedProvinces = data.provinces.map((province) => {
    const original = province.vertices || [];
    totalOriginal += original.length;

    const simplified = simplifyVertices(original, tolerance);
    totalSimplified += simplified.length;

    return {
      ...province,
      vertices: simplified,
    };
  });

  return {
    result: {
      ...data,
      provinces: simplifiedProvinces,
    },
    stats: {
      provinces: data.provinces.length,
      verticesOriginal: totalOriginal,
      verticesSimplified: totalSimplified,
      removed: totalOriginal - totalSimplified,
      reductionPercent: totalOriginal > 0
        ? ((1 - totalSimplified / totalOriginal) * 100).toFixed(1)
        : 0,
    },
  };
}

// ====================== Main ======================

const args = process.argv.slice(2);

if (args.length < 2) {
  console.error('Uso: node simplify-provinces.js <input.json> <output.json> [tolerancia]');
  console.error('Exemplo: node simplify-provinces.js mapa.json mapa-limpo.json 1.5');
  process.exit(1);
}

const inputPath = path.resolve(args[0]);
const outputPath = path.resolve(args[1]);
const tolerance = args[2] !== undefined ? parseFloat(args[2]) : 1;

if (isNaN(tolerance) || tolerance < 0) {
  console.error('Tolerância deve ser um número >= 0');
  process.exit(1);
}

console.log(`Lendo: ${inputPath}`);
console.log(`Tolerância: ${tolerance}`);

const raw = fs.readFileSync(inputPath, 'utf8');
const data = JSON.parse(raw);

console.log('Processando...');

const { result, stats } = processProvinces(data, tolerance);

fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));

console.log('\nResultado:');
console.log(`  Províncias processadas : ${stats.provinces}`);
console.log(`  Vértices originais     : ${stats.verticesOriginal.toLocaleString()}`);
console.log(`  Vértices após limpeza  : ${stats.verticesSimplified.toLocaleString()}`);
console.log(`  Removidos              : ${stats.removed.toLocaleString()} (${stats.reductionPercent}%)`);
console.log(`\nArquivo salvo em: ${outputPath}`);