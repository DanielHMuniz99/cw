<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable([
    'map_id',
    'province_key',
    'name',
    'default_country_id',
    'center_key',
    'vertices',
])]
class MapProvince extends Model
{
    use HasFactory;

    protected function casts(): array
    {
        return [
            'vertices' => 'array',
        ];
    }

    public function map(): BelongsTo
    {
        return $this->belongsTo(Map::class);
    }
}
