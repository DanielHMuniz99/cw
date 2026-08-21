<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Fillable([
    'type_key',
    'name',
    'description',
    'attack',
    'defense',
    'speed',
    'max_organization',
    'production_cost',
    'production_time',
    'is_active',
    'sort_order',
])]
class UnitType extends Model
{
    use HasFactory;

    protected function casts(): array
    {
        return [
            'attack' => 'decimal:2',
            'defense' => 'decimal:2',
            'speed' => 'decimal:2',
            'max_organization' => 'decimal:2',
            'is_active' => 'boolean',
        ];
    }

    public function gameFormationDetachments(): HasMany
    {
        return $this->hasMany(GameFormationDetachment::class, 'type_key', 'type_key');
    }
}
