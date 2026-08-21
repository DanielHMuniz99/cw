<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Str;
use Throwable;

/**
 * Importa um mapa (visual + centers) de uma pasta para o banco.
 *
 * Estrutura esperada:
 *   storage/app/maps/{slug}/
 *     visual.json    → provinces (polígonos)
 *     centers.json   → points (grafo de movimento)
 *
 * Uso:
 *   php artisan map:import europe
 *   php artisan map:import europe --path=/caminho/absoluto/ou/relativo
 *   php artisan map:import europe --name="Europa 1939" --force
 */
class ImportMapCommand extends Command
{
    protected $signature = 'map:import
                            {slug : Identificador do mapa (pasta e slug no banco)}
                            {--path= : Pasta base (default: storage/app/maps/{slug})}
                            {--name= : Nome amigável (default: slug formatado)}
                            {--force : Atualiza se o mapa já existir}';

    protected $description = 'Importa visual.json e centers.json de uma pasta para as tabelas maps / map_provinces / map_centers';

    public function handle(): int
    {
        $slug = Str::slug($this->argument('slug'));
        $force = (bool) $this->option('force');
        $name = $this->option('name') ?: Str::title(str_replace('-', ' ', $slug));

        $dir = $this->option('path')
            ? base_path($this->option('path'))
            : storage_path('app/maps/'.$slug);

        // Se --path for absoluto, base_path pode bagunçar — normaliza
        if ($this->option('path') && Str::startsWith($this->option('path'), ['/', 'C:', 'D:'])) {
            $dir = $this->option('path');
        } elseif ($this->option('path')) {
            $dir = base_path($this->option('path'));
        }

        $visualPath = $dir.DIRECTORY_SEPARATOR.'visual.json';
        $centersPath = $dir.DIRECTORY_SEPARATOR.'centers.json';

        if (! File::isDirectory($dir)) {
            $this->error("Pasta não encontrada: {$dir}");
            $this->line('Crie a pasta e coloque visual.json + centers.json dentro.');

            return self::FAILURE;
        }

        if (! File::exists($visualPath)) {
            $this->error("Arquivo ausente: {$visualPath}");

            return self::FAILURE;
        }

        if (! File::exists($centersPath)) {
            $this->error("Arquivo ausente: {$centersPath}");

            return self::FAILURE;
        }

        try {
            $visual = json_decode(File::get($visualPath), true, 512, JSON_THROW_ON_ERROR);
            $centers = json_decode(File::get($centersPath), true, 512, JSON_THROW_ON_ERROR);
        } catch (Throwable $e) {
            $this->error('JSON inválido: '.$e->getMessage());

            return self::FAILURE;
        }

        $existing = DB::table('maps')->where('slug', $slug)->first();

        if ($existing && ! $force) {
            $this->error("Mapa '{$slug}' já existe. Use --force para sobrescrever.");

            return self::FAILURE;
        }

        $provinces = $this->extractProvinces($visual);
        $points = $this->extractPoints($centers);

        if (count($provinces) === 0) {
            $this->warn('Nenhuma província encontrada no visual.json');
        }
        if (count($points) === 0) {
            $this->warn('Nenhum center/point encontrado no centers.json');
        }

        try {
            DB::transaction(function () use ($slug, $name, $visual, $centers, $provinces, $points, $existing) {
                if ($existing) {
                    DB::table('map_provinces')->where('map_id', $existing->id)->delete();
                    DB::table('map_centers')->where('map_id', $existing->id)->delete();

                    DB::table('maps')->where('id', $existing->id)->update([
                        'name' => $name,
                        'schema_version' => (int) ($visual['schemaVersion'] ?? $centers['schemaVersion'] ?? 1),
                        'width' => (int) ($visual['width'] ?? 0),
                        'height' => (int) ($visual['height'] ?? 0),
                        'centers_width' => isset($centers['width']) ? (int) $centers['width'] : null,
                        'centers_height' => isset($centers['height']) ? (int) $centers['height'] : null,
                        'overlay_image' => $visual['overlayImage'] ?? $centers['overlayImage'] ?? null,
                        'type' => $visual['type'] ?? 'visual-province-map',
                        'meta' => json_encode([
                            'visual_created_at' => $visual['createdAt'] ?? null,
                            'centers_created_at' => $centers['createdAt'] ?? null,
                        ]),
                        'updated_at' => now(),
                    ]);

                    $mapId = (int) $existing->id;
                    $this->info("Mapa #{$mapId} atualizado.");
                } else {
                    $mapId = DB::table('maps')->insertGetId([
                        'name' => $name,
                        'slug' => $slug,
                        'schema_version' => (int) ($visual['schemaVersion'] ?? $centers['schemaVersion'] ?? 1),
                        'width' => (int) ($visual['width'] ?? 0),
                        'height' => (int) ($visual['height'] ?? 0),
                        'centers_width' => isset($centers['width']) ? (int) $centers['width'] : null,
                        'centers_height' => isset($centers['height']) ? (int) $centers['height'] : null,
                        'overlay_image' => $visual['overlayImage'] ?? $centers['overlayImage'] ?? null,
                        'type' => $visual['type'] ?? 'visual-province-map',
                        'meta' => json_encode([
                            'visual_created_at' => $visual['createdAt'] ?? null,
                            'centers_created_at' => $centers['createdAt'] ?? null,
                        ]),
                        'is_active' => true,
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]);
                    $this->info("Mapa #{$mapId} criado.");
                }

                $this->importProvinces($mapId, $provinces);
                $this->importCenters($mapId, $points);
            });
        } catch (Throwable $e) {
            $this->error('Falha na importação: '.$e->getMessage());

            return self::FAILURE;
        }

        $this->info('Importação concluída.');
        $this->table(
            ['Item', 'Quantidade'],
            [
                ['Províncias', count($provinces)],
                ['Centers', count($points)],
            ]
        );

        return self::SUCCESS;
    }

    /**
     * Aceita "provinces" no root do visual.json
     */
    private function extractProvinces(array $visual): array
    {
        $list = $visual['provinces'] ?? [];

        return is_array($list) ? $list : [];
    }

    /**
     * Aceita "points" (centers.json) ou "centers" se vier com outro nome.
     */
    private function extractPoints(array $centers): array
    {
        if (isset($centers['points']) && is_array($centers['points'])) {
            return $centers['points'];
        }
        if (isset($centers['centers']) && is_array($centers['centers'])) {
            // se "centers" for string (nome de arquivo), ignora
            if (is_string($centers['centers'])) {
                return [];
            }

            return $centers['centers'];
        }

        return [];
    }

    private function importProvinces(int $mapId, array $provinces): void
    {
        $now = now();
        $rows = [];

        foreach ($provinces as $i => $p) {
            if (! is_array($p)) {
                continue;
            }

            $key = isset($p['id']) ? (int) $p['id'] : ($i + 1);
            $vertices = $p['vertices'] ?? [];

            if (! is_array($vertices) || count($vertices) < 3) {
                continue;
            }

            // normaliza vertices
            $cleanVertices = [];
            foreach ($vertices as $v) {
                if (! is_array($v)) {
                    continue;
                }
                $x = isset($v['x']) ? (float) $v['x'] : null;
                $y = isset($v['y']) ? (float) $v['y'] : null;
                if ($x === null || $y === null || ! is_finite($x) || ! is_finite($y)) {
                    continue;
                }
                $cleanVertices[] = ['x' => $x, 'y' => $y];
            }

            if (count($cleanVertices) < 3) {
                continue;
            }

            $countryId = $p['country_id'] ?? null;
            if ($countryId === '' || $countryId === null) {
                $countryId = null;
            } else {
                $countryId = (int) $countryId;
            }

            $centerKey = $p['center_id'] ?? null;
            if ($centerKey === '' || $centerKey === null) {
                $centerKey = null;
            } else {
                $centerKey = (int) $centerKey;
            }

            $rows[] = [
                'map_id' => $mapId,
                'province_key' => $key,
                'name' => isset($p['name']) ? (string) $p['name'] : "Província {$key}",
                'default_country_id' => $countryId,
                'center_key' => $centerKey,
                'vertices' => json_encode($cleanVertices),
                'created_at' => $now,
                'updated_at' => $now,
            ];

            // insert em lotes
            if (count($rows) >= 200) {
                DB::table('map_provinces')->insert($rows);
                $rows = [];
            }
        }

        if (count($rows) > 0) {
            DB::table('map_provinces')->insert($rows);
        }
    }

    private function importCenters(int $mapId, array $points): void
    {
        $now = now();
        $rows = [];

        foreach ($points as $i => $p) {
            if (! is_array($p)) {
                continue;
            }

            $key = isset($p['id']) ? (int) $p['id'] : ($i + 1);
            $x = isset($p['x']) ? (float) $p['x'] : null;
            $y = isset($p['y']) ? (float) $p['y'] : null;

            if ($x === null || $y === null || ! is_finite($x) || ! is_finite($y)) {
                continue;
            }

            $borders = [];
            if (isset($p['borders']) && is_array($p['borders'])) {
                foreach ($p['borders'] as $b) {
                    $bid = (int) $b;
                    if ($bid > 0) {
                        $borders[] = $bid;
                    }
                }
            }

            $owner = $p['owner'] ?? null;
            if ($owner === '' || $owner === null) {
                $owner = null;
            } else {
                $owner = (int) $owner;
            }

            // campo "center" no JSON → is_center
            $isCenter = true;
            if (array_key_exists('center', $p)) {
                $isCenter = (bool) $p['center'];
            } elseif (array_key_exists('is_center', $p)) {
                $isCenter = (bool) $p['is_center'];
            }

            $rows[] = [
                'map_id' => $mapId,
                'center_key' => $key,
                'name' => isset($p['name']) ? (string) $p['name'] : null,
                'is_center' => $isCenter,
                'x' => $x,
                'y' => $y,
                'default_owner_id' => $owner,
                'borders' => json_encode($borders),
                'created_at' => $now,
                'updated_at' => $now,
            ];

            if (count($rows) >= 200) {
                DB::table('map_centers')->insert($rows);
                $rows = [];
            }
        }

        if (count($rows) > 0) {
            DB::table('map_centers')->insert($rows);
        }
    }
}