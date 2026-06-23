// auth.js
import { supabase } from './supabase.js';

// Состояние авторизации
let currentUser = null;

// ========== ФУНКЦИИ АВТОРИЗАЦИИ ==========

// Регистрация нового пользователя
export async function registerUser(email, password, username) {
    try {
        console.log('Начинаем регистрацию:', { email, username });
        
        // 1. Регистрируем пользователя в Supabase Auth
        const { data: authData, error: authError } = await supabase.auth.signUp({
            email: email,
            password: password,
            options: {
                data: {
                    username: username || email.split('@')[0]
                }
            }
        });
        
        if (authError) {
            console.error('Ошибка Auth:', authError);
            throw authError;
        }
        
        console.log('Auth успешен:', authData);
        
        if (!authData.user) {
            throw new Error('Пользователь не создан');
        }
        
        // 2. Ждем немного, чтобы триггер сработал
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // 3. Проверяем, создался ли профиль
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', authData.user.id)
            .maybeSingle();
        
        if (profileError) {
            console.error('Ошибка при проверке профиля:', profileError);
        }
        
        if (!profile) {
            // Если профиль не создался, создаем вручную
            console.log('Профиль не найден, создаем вручную...');
            const { error: insertError } = await supabase
                .from('profiles')
                .insert([
                    {
                        id: authData.user.id,
                        email: email,
                        username: username || email.split('@')[0],
                        created_at: new Date()
                    }
                ]);
            
            if (insertError) {
                console.error('Ошибка при создании профиля:', insertError);
                // Не возвращаем ошибку, так как пользователь уже создан
            } else {
                console.log('Профиль успешно создан вручную');
            }
        }
        
        return { 
            success: true, 
            user: authData.user,
            message: 'Регистрация успешна! Проверьте почту для подтверждения (если требуется).'
        };
        
    } catch (error) {
        console.error('Ошибка регистрации:', error);
        
        // Понятное сообщение для пользователя
        let userMessage = 'Ошибка регистрации';
        if (error.message.includes('User already registered')) {
            userMessage = 'Пользователь с таким email уже зарегистрирован';
        } else if (error.message.includes('password')) {
            userMessage = 'Пароль слишком слабый. Используйте минимум 6 символов';
        } else if (error.message.includes('Database error')) {
            userMessage = 'Ошибка сервера. Пожалуйста, попробуйте позже';
        } else {
            userMessage = error.message;
        }
        
        return { 
            success: false, 
            error: userMessage 
        };
    }
}

// Вход в аккаунт
export async function loginUser(email, password) {
    try {
        const { data, error } = await supabase.auth.signInWithPassword({
            email: email,
            password: password
        });
        
        if (error) throw error;
        
        // Получаем дополнительные данные пользователя
        const { data: profileData } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', data.user.id)
            .maybeSingle();
        
        currentUser = {
            id: data.user.id,
            email: data.user.email,
            ...profileData
        };
        
        return { success: true, user: currentUser };
    } catch (error) {
        console.error('Ошибка входа:', error);
        
        let userMessage = 'Неверный email или пароль';
        if (error.message.includes('Email not confirmed')) {
            userMessage = 'Подтвердите email перед входом. Проверьте почту!';
        }
        
        return { success: false, error: userMessage };
    }
}

// Выход из аккаунта
export async function logoutUser() {
    try {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
        
        currentUser = null;
        return { success: true };
    } catch (error) {
        console.error('Ошибка выхода:', error);
        return { success: false, error: error.message };
    }
}

// Проверка текущего пользователя
export async function checkCurrentUser() {
    try {
        const { data: { user }, error } = await supabase.auth.getUser();
        
        if (error || !user) {
            currentUser = null;
            return null;
        }
        
        // Получаем профиль
        const { data: profileData } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .maybeSingle();
        
        currentUser = {
            id: user.id,
            email: user.email,
            ...profileData
        };
        
        return currentUser;
    } catch (error) {
        console.error('Ошибка проверки пользователя:', error);
        return null;
    }
}

// Получить текущего пользователя
export function getCurrentUser() {
    return currentUser;
}

// Сброс пароля
export async function resetPassword(email) {
    try {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: window.location.origin
        });
        
        if (error) throw error;
        return { success: true };
    } catch (error) {
        console.error('Ошибка сброса пароля:', error);
        return { success: false, error: error.message };
    }
}
