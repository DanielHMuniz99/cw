<?php

namespace App\Http\Controllers;

use App\Models\Game;
use App\Models\UnitType;
use Illuminate\Http\JsonResponse;

class GameQueryController extends Controller
{
    public function show(Game $game): JsonResponse
    {
        return $this->respondWithGame($game);
    }

    public function showByCode(string $code): JsonResponse
    {
        $game = Game::query()->where('code', $code)->firstOrFail();

        return $this->respondWithGame($game);
    }

    private function respondWithGame(Game $game): JsonResponse
    {
        $game->load([
            'map.provinces',
            'map.centers',
            'hostUser',
            'players.user',
            'formations.gamePlayer',
            'formations.user',
            'formations.detachments.unitType',
        ]);

        $unitTypes = UnitType::query()
            ->orderBy('sort_order')
            ->orderBy('name')
            ->get();

        return response()->json([
            'data' => [
                'game' => $game,
                'unit_types' => $unitTypes,
            ],
        ]);
    }
}
