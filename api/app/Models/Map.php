<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Fillable([
    'name',
    'slug',
    'schema_version',
    'width',
    'height',
    'centers_width',
    'centers_height',
    'overlay_image',
    'type',
    'meta',
    'is_active',
])]
class Map extends Model
{
    use HasFactory;

    protected function casts(): array
    {
        return [
            'meta' => 'array',
            'is_active' => 'boolean',
        ];
    }

    public function provinces(): HasMany
    {
        return $this->hasMany(MapProvince::class);
    }

    public function centers(): HasMany
    {
        return $this->hasMany(MapCenter::class);
    }

    public function games(): HasMany
    {
        return $this->hasMany(Game::class);
    }
}
