<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Províncias visuais de um mapa (polígonos).
 * Equivale ao array "provinces" do JSON visual.
 *
 * vertices: [{ "x": 121, "y": 121 }, ...]
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('map_provinces', function (Blueprint $table) {
            $table->id();
            $table->foreignId('map_id')
                ->constrained('maps')
                ->cascadeOnDelete();
            $table->unsignedInteger('province_key');
            $table->string('name')->nullable();
            $table->unsignedBigInteger('default_country_id')->nullable();
            $table->unsignedInteger('center_key')->nullable()->index();
            $table->json('vertices');
            $table->timestamps();
            $table->unique(['map_id', 'province_key']);
            $table->index(['map_id', 'center_key']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('map_provinces');
    }
};
