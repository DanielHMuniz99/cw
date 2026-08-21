<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

class UserSeeder extends Seeder
{
    public function run(): void
    {
        $email = 'admin@game.local';

        $exists = DB::table('users')->where('email', $email)->exists();

        if ($exists) {
            $this->command?->info("Usuário já existe: {$email}");

            return;
        }

        DB::table('users')->insert([
            'name' => 'Admin',
            'email' => $email,
            'password' => Hash::make('password'),
            'display_name' => 'Admin',
            'email_verified_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->command?->info('Usuário criado:');
        $this->command?->info("  email:    {$email}");
        $this->command?->info('  password: password');
    }
}
