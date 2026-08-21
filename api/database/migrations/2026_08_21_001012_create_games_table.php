<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Partida — uma sessão de jogo ligada a um mapa.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('games', function (Blueprint $table) {
            $table->id();
            $table->string('name')->nullable();
            $table->string('code', 16)->unique()->nullable();
            $table->foreignId('map_id')
                ->constrained('maps')
                ->restrictOnDelete();
            $table->foreignId('host_user_id')
                ->constrained('users')
                ->cascadeOnDelete();

            /**
             * waiting   = aguardando jogadores
             * running   = em andamento
             * finished  = encerrada
             * cancelled = cancelada
             */
            $table->string('status', 32)->default('waiting')->index();
            $table->unsignedTinyInteger('max_players')->default(8);
            $table->timestamp('started_at')->nullable();
            $table->timestamp('finished_at')->nullable();
            $table->json('settings')->nullable();
            $table->timestamps();
        });

        Schema::create('game_players', function (Blueprint $table) {
            $table->id();
            $table->foreignId('game_id')
                ->constrained('games')
                ->cascadeOnDelete();
            $table->foreignId('user_id')
                ->constrained('users')
                ->cascadeOnDelete();
            $table->unsignedInteger('country_slot')->nullable();
            $table->boolean('is_ready')->default(false);
            $table->boolean('is_host')->default(false);
            $table->string('status', 32)->default('active');
            $table->timestamps();
            $table->unique(['game_id', 'user_id']);
            $table->unique(['game_id', 'country_slot']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('game_players');
        Schema::dropIfExists('games');
    }
};
