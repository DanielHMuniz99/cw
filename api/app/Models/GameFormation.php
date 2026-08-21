<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Fillable([
    'game_id',
    'game_player_id',
    'user_id',
    'public_id',
    'name',
    'tier',
    'status',
    'center_key',
    'organization',
    'movement_path',
    'movement_from_center_key',
    'movement_to_center_key',
    'movement_started_at',
    'movement_speed',
    'movement_world_speed_scale',
])]
class GameFormation extends Model
{
    use HasFactory;

    protected function casts(): array
    {
        return [
            'organization' => 'decimal:2',
            'movement_path' => 'array',
            'movement_started_at' => 'datetime',
            'movement_speed' => 'decimal:2',
            'movement_world_speed_scale' => 'decimal:4',
        ];
    }

    public function game(): BelongsTo
    {
        return $this->belongsTo(Game::class);
    }

    public function gamePlayer(): BelongsTo
    {
        return $this->belongsTo(GamePlayer::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function detachments(): HasMany
    {
        return $this->hasMany(GameFormationDetachment::class);
    }
}
