<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable([
    'game_formation_id',
    'type_key',
    'strength',
    'experience',
])]
class GameFormationDetachment extends Model
{
    use HasFactory;

    public function gameFormation(): BelongsTo
    {
        return $this->belongsTo(GameFormation::class);
    }

    public function unitType(): BelongsTo
    {
        return $this->belongsTo(UnitType::class, 'type_key', 'type_key');
    }
}
