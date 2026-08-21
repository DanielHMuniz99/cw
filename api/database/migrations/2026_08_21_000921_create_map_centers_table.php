<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Centers / points de um mapa (grafo de movimento).
 * Equivale ao array "points" do JSON de centers.
 *
 * borders: [630, 649, 1092] — ids (center_key) conectados
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('map_centers', function (Blueprint $table) {
            $table->id();
            $table->foreignId('map_id')
                ->constrained('maps')
                ->cascadeOnDelete();
            $table->unsignedInteger('center_key');
            $table->string('name')->nullable();
            $table->boolean('is_center')->default(true);
            $table->double('x');
            $table->double('y');
            $table->unsignedBigInteger('default_owner_id')->nullable();
            $table->json('borders')->nullable();
            $table->timestamps();
            $table->unique(['map_id', 'center_key']);
            $table->index(['map_id', 'is_center']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('map_centers');
    }
};
