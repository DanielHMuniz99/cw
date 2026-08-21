<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Fillable([
    'game_id',
    'user_id',
    'country_slot',
    'is_ready',
    'is_host',
    'status',
])]
class GamePlayer extends Model
{
    use HasFactory;

    protected function casts(): array
    {
        return [
            'is_ready' => 'boolean',
            'is_host' => 'boolean',
        ];
    }

    public function game(): BelongsTo
    {
        return $this->belongsTo(Game::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function formations(): HasMany
    {
        return $this->hasMany(GameFormation::class);
    }
}
