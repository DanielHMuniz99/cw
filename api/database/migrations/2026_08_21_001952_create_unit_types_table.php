<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Catálogo global de tipos de tropa (o que pode ser spawnado).
 * Equivale ao array "unitTypes" do JSON.
 *
 * Não pertence a uma partida — é definição do jogo.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('unit_types', function (Blueprint $table) {
            $table->id();
            $table->string('type_key', 64)->unique();

            $table->string('name');
            $table->text('description')->nullable();

            $table->decimal('attack', 8, 2)->default(0);
            $table->decimal('defense', 8, 2)->default(0);
            $table->decimal('speed', 8, 2)->default(0);
            $table->decimal('max_organization', 8, 2)->default(0);

            $table->unsignedInteger('production_cost')->default(0);
            $table->unsignedInteger('production_time')->default(0);
            $table->boolean('is_active')->default(true);
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('unit_types');
    }
};