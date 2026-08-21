<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Formações que existem de fato em uma partida.
 * Equivale a "exampleFormations" / Formation do modelo TS.
 *
 * Composição (detachments) → tabela game_formation_detachments.
 * Movimento autoritativo por tempo → colunas path / started_at / etc.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('game_formations', function (Blueprint $table) {
            $table->id();

            $table->foreignId('game_id')
                ->constrained('games')
                ->cascadeOnDelete();

            /**
             * Dono da formação (jogador da partida).
             * Nullable só se quiser permitir neutro/IA sem user.
             */
            $table->foreignId('game_player_id')
                ->nullable()
                ->constrained('game_players')
                ->nullOnDelete();

            /** user_id denormalizado para queries rápidas (opcional mas útil) */
            $table->foreignId('user_id')
                ->nullable()
                ->constrained('users')
                ->nullOnDelete();

            /** ID público estável (ex.: f-001) se quiser expor ao client */
            $table->string('public_id', 64)->nullable()->unique();

            $table->string('name')->nullable();

            /**
             * detachment | regiment | battalion | division | corps
             */
            $table->string('tier', 32)->default('detachment');

            /**
             * idle | moving | combat | disorganized
             */
            $table->string('status', 32)->default('idle')->index();

            /** center_key do mapa (map_centers.center_key) */
            $table->unsignedInteger('center_key')->index();

            /** Organização atual */
            $table->decimal('organization', 12, 2)->default(0);

            // ----- Movimento (modelo por tempo; posição = cálculo) -----

            /** Path completo de center_keys: [629, 630, 649] */
            $table->json('movement_path')->nullable();

            $table->unsignedInteger('movement_from_center_key')->nullable();
            $table->unsignedInteger('movement_to_center_key')->nullable();

            /** Timestamp servidor do início da ordem */
            $table->timestamp('movement_started_at')->nullable();

            /**
             * Speed congelada no momento da ordem
             * (evita mudar no meio do caminho se a composição mudar).
             */
            $table->decimal('movement_speed', 8, 2)->nullable();

            $table->decimal('movement_world_speed_scale', 8, 4)->nullable();
            $table->timestamps();

            $table->index(['game_id', 'center_key']);
            $table->index(['game_id', 'status']);
            $table->index(['game_id', 'user_id']);
        });

        /**
         * Peças dentro da formação (detachments).
         * type_key referencia unit_types.type_key
         */
        Schema::create('game_formation_detachments', function (Blueprint $table) {
            $table->id();

            $table->foreignId('game_formation_id')
                ->constrained('game_formations')
                ->cascadeOnDelete();

            $table->string('type_key', 64);
            $table->unsignedInteger('strength')->default(0);
            $table->unsignedTinyInteger('experience')->default(0);

            $table->timestamps();
            $table->index(['game_formation_id', 'type_key']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('game_formation_detachments');
        Schema::dropIfExists('game_formations');
    }
};
