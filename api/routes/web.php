<?php

use App\Http\Controllers\GameQueryController;
use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return view('welcome');
});

Route::prefix('api')->group(function (): void {
    Route::get('/games/{game}', [GameQueryController::class, 'show']);
    Route::get('/games/code/{code}', [GameQueryController::class, 'showByCode']);
});
