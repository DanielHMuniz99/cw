// fixBorders.js
const fs = require('fs');
const path = require('path');

/**
 * Calcula a distância euclidiana entre dois pontos
 */
function calculateDistance(point1, point2) {
    const dx = point1.x - point2.x;
    const dy = point1.y - point2.y;
    return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Encontra todos os pontos dentro da distância de tolerância
 */
function findNearbyPoints(points, targetPoint, tolerance) {
    const nearby = [];
    
    for (const point of points) {
        // Ignora o próprio ponto
        if (point.id === targetPoint.id) continue;
        
        // Ignora se não for um center (caso existam outros tipos)
        if (!point.center) continue;
        
        const distance = calculateDistance(targetPoint, point);
        if (distance <= tolerance) {
            nearby.push(point.id);
        }
    }
    
    return nearby;
}

/**
 * Processa o arquivo JSON e ajusta as bordas
 */
function processMapData(jsonData, tolerance = 25) {
    // Filtra apenas os pontos que são centers
    const centers = jsonData.points.filter(point => point.center === true);
    
    // Para cada center, encontra e define as bordas
    for (const point of centers) {
        const nearbyIds = findNearbyPoints(centers, point, tolerance);
        point.borders = nearbyIds;
    }
    
    return jsonData;
}

/**
 * Função principal
 */
function main() {
    // Verifica argumentos da linha de comando
    const args = process.argv.slice(2);
    
    if (args.length < 1) {
        console.error('Uso: node fixBorders.js <arquivo.json> [tolerancia]');
        console.error('Exemplo: node fixBorders.js mapa.json 30');
        process.exit(1);
    }
    
    const filePath = args[0];
    const tolerance = args[1] ? parseFloat(args[1]) : 25;
    
    // Verifica se o arquivo existe
    if (!fs.existsSync(filePath)) {
        console.error(`Arquivo não encontrado: ${filePath}`);
        process.exit(1);
    }
    
    try {
        // Lê o arquivo JSON
        const rawData = fs.readFileSync(filePath, 'utf8');
        const jsonData = JSON.parse(rawData);
        
        console.log(`Processando ${jsonData.points.length} pontos...`);
        console.log(`Tolerância: ${tolerance}px`);
        
        // Processa os dados
        const processedData = processMapData(jsonData, tolerance);
        
        // Gera o nome do arquivo de saída
        const dir = path.dirname(filePath);
        const ext = path.extname(filePath);
        const baseName = path.basename(filePath, ext);
        const outputPath = path.join(dir, `${baseName}_fixed${ext}`);
        
        // Salva o arquivo processado
        fs.writeFileSync(outputPath, JSON.stringify(processedData, null, 2), 'utf8');
        
        console.log(`✅ Arquivo processado com sucesso: ${outputPath}`);
        console.log(`Total de centers processados: ${jsonData.points.filter(p => p.center).length}`);
        
        // Estatísticas
        const centers = jsonData.points.filter(p => p.center);
        const withBorders = centers.filter(p => p.borders && p.borders.length > 0);
        console.log(`Centers com bordas: ${withBorders.length}/${centers.length}`);
        
        // Mostra alguns exemplos
        console.log('\nExemplos de bordas definidas:');
        const examples = centers.slice(0, 5);
        for (const point of examples) {
            console.log(`  ${point.name} (${point.id}): ${point.borders.length} bordas -> [${point.borders.join(', ')}]`);
        }
        
    } catch (error) {
        console.error('❌ Erro ao processar o arquivo:', error.message);
        process.exit(1);
    }
}

// Executa o script
if (require.main === module) {
    main();
}

module.exports = { calculateDistance, findNearbyPoints, processMapData };