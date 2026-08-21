<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable([
    'map_id',
    'center_key',
    'name',
    'is_center',
    'x',
    'y',
    'default_owner_id',
    'borders',
])]
class MapCenter extends Model
{
    use HasFactory;

    protected function casts(): array
    {
        return [
            'is_center' => 'boolean',
            'x' => 'float',
            'y' => 'float',
            'borders' => 'array',
        ];
    }

    public function map(): BelongsTo
    {
        return $this->belongsTo(Map::class);
    }
}
