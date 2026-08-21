<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Mapa mestre — um jogo pode ter vários mapas.
 * Visual (províncias) e centers ficam em tabelas filhas.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('maps', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('slug')->unique();
            $table->unsignedSmallInteger('schema_version')->default(1);
            $table->unsignedInteger('width');
            $table->unsignedInteger('height');
            $table->unsignedInteger('centers_width')->nullable();
            $table->unsignedInteger('centers_height')->nullable();
            $table->string('overlay_image')->nullable();
            $table->string('type')->default('visual-province-map');
            $table->json('meta')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('maps');
    }
};
