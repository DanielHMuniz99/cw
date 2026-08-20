#!/usr/bin/env node

/**
 * Simplifica polígonos de provincias usando o algoritmo Douglas-Peucker.
 *
 * Uso:
 *   node simplify-douglas-peucker.js <input.json> <output.json> [tolerancia]
 *
 * Exemplo:
 *   node simplify-douglas-peucker.js mapa.json mapa-limpo-dp.json 1.5
 */

const fs = require('fs');
const path = require('path');

/**
 * Distância perpendicular de um ponto até a linha formada por p1 e p2.
 */
function perpendicularDistance(point, p1, p2) {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;

  // Caso especial: p1 e p2 são o mesmo ponto
  if (dx === 0 && dy === 0) {
    const ddx = point.x - p1.x;
    const ddy = point.y - p1.y;
    return Math.sqrt(ddx * ddx + ddy * ddy);
  }

  // Fórmula da distância ponto-linha
  const numerator = Math.abs(dy * point.x - dx * point.y + p2.x * p1.y - p2.y * p1.x);
  const denominator = Math.sqrt(dx * dx + dy * dy);

  return numerator / denominator;
}

/**
 * Implementação recursiva do Douglas-Peucker.
 * Sempre mantém o primeiro e o último ponto.
 */
function douglasPeucker(points, tolerance) {
  if (points.length <= 2) {
    return points.slice(); // cópia rasa
  }

  // Encontra o ponto com maior distância perpendicular
  let maxDistance = 0;
  let maxIndex = 0;

  const first = points[0];
  const last = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const dist = perpendicularDistance(points[i], first, last);
    if (dist > maxDistance) {
      maxDistance = dist;
      maxIndex = i;
    }
  }

  // Se a maior distância for maior que a tolerância, divide e processa recursivamente
  if (maxDistance > tolerance) {
    const left = douglasPeucker(points.slice(0, maxIndex + 1), tolerance);
    const right = douglasPeucker(points.slice(maxIndex), tolerance);

    // Junta as duas partes (remove o ponto duplicado do meio)
    return left.slice(0, -1).concat(right);
  }

  // Caso contrário, todos os pontos intermediários podem ser removidos
  return [first, last];
}

/**
 * Processa todas as provincias
 */
function processProvinces(data, tolerance) {
  if (!data.provinces || !Array.isArray(data.provinces)) {
    throw new Error('JSON inválido: propriedade "provinces" não encontrada ou não é array');
  }

  let totalOriginal = 0;
  let totalSimplified = 0;

  const simplifiedProvinces = data.provinces.map((province) => {
    const original = province.vertices || [];
    totalOriginal += original.length;

    const simplified = douglasPeucker(original, tolerance);
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
  console.error('Uso: node simplify-douglas-peucker.js <input.json> <output.json> [tolerancia]');
  console.error('Exemplo: node simplify-douglas-peucker.js mapa.json mapa-limpo-dp.json 1.5');
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
console.log(`Tolerância (Douglas-Peucker): ${tolerance}`);

const raw = fs.readFileSync(inputPath, 'utf8');
const data = JSON.parse(raw);

console.log('Processando com Douglas-Peucker...');

const { result, stats } = processProvinces(data, tolerance);

fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));

console.log('\nResultado:');
console.log(`  Províncias processadas : ${stats.provinces}`);
console.log(`  Vértices originais     : ${stats.verticesOriginal.toLocaleString()}`);
console.log(`  Vértices após limpeza  : ${stats.verticesSimplified.toLocaleString()}`);
console.log(`  Removidos              : ${stats.removed.toLocaleString()} (${stats.reductionPercent}%)`);
console.log(`\nArquivo salvo em: ${outputPath}`);