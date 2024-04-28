const express = require('express');
const mysql = require('mysql2');
const ejs = require('ejs');
const bodyParser = require('body-parser');
const session = require('express-session');

const app = express();
const port = 3000;

app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({
    secret: 'secret-key',
    resave: false,
    saveUninitialized: true
}));

const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'bookshop'
});

// Добавление книги
app.post('/add', (req, res) => {
    const { name, genre, description, price } = req.body;
    db.query('INSERT INTO books (name, genre, description, price) VALUES (?, ?, ?, ?)', [name, genre, description, price], (err) => {
        if (err) {
            console.error('Error adding book:', err);
            return res.status(500).send('Error adding book');
        }
        res.redirect('/admin/books'); // После успешного добавления продукта перезагружаем страницу
    });
});

app.post('/addEmploy', (req, res) => {
    const { name, address, birthday, phone, salary } = req.body;
    db.query('INSERT INTO employees (name, address, birthday, phone, salary) VALUES (?, ?, ?, ?, ?)', [name, address, birthday, phone, salary], (err) => {
        if (err) {
            console.error('Error adding employ:', err);
            return res.status(500).send('Error adding employ');
        }
        res.redirect('/admin/employees'); // После успешного добавления продукта перезагружаем страницу
    });
});

// Проверка аутентификации пользователя
const isAuthenticated = (req, res, next) => {
    if (req.session.authenticated) {
        next();
    } else {
        res.redirect('/login');
    }
};

// Главная страница - Магазин
app.get('/',  (req, res) => {
    db.query('SELECT * FROM books', (err, results) => {
        if (err) {
            console.error('Error fetching books:', err);
            return res.status(500).send('Error fetching books');
        }
        const books = results; // Полученные продукты из базы данных

        // Получаем идентификатор пользователя из сессии
        const userId = req.session.userId;

        // Запрос к базе данных для получения информации о пользователе, включая его приоритет
        db.query('SELECT priority FROM users WHERE id = ?', [userId], (err, userResults) => {
            if (err) {
                console.error('Error fetching user priority:', err);
                return res.status(500).send('Error fetching user priority');
            }

            // Получаем приоритет пользователя из результатов запроса
            const userPriority = req.session.userPriority || 0;

            // Определяем букву в углу экрана в зависимости от приоритета пользователя
            let cornerLetter = '';
            if (userPriority === 2) {
                cornerLetter = 'A';
            }

            // Передаем продукты, букву и приоритет пользователя в шаблон
            res.render('index', { books, cornerLetter, userPriority });
        });
    });
});

// Поиск
app.post('/search',  (req, res) => {
    const search = '%' + req.body.search + '%'
    const min_price = req.body.min_price
    const max_price = req.body.max_price
    db.query('SELECT * FROM books WHERE (name LIKE ? or genre LIKE ? or description LIKE ?) and price >= ? and price <= ?', 
    [search, search, search, min_price, max_price], (err, results) => {
        if (err) {
            console.error('Error fetching books:', err);
            return res.status(500).send('Error fetching books');
        }
        const books = results; // Полученные продукты из базы данных

        // Получаем идентификатор пользователя из сессии
        const userId = req.session.userId;

        // Запрос к базе данных для получения информации о пользователе, включая его приоритет
        db.query('SELECT priority FROM users WHERE id = ?', [userId], (err, userResults) => {
            if (err) {
                console.error('Error fetching user priority:', err);
                return res.status(500).send('Error fetching user priority');
            }

            // Получаем приоритет пользователя из результатов запроса
            const userPriority = req.session.userPriority || 0;

            // Определяем букву в углу экрана в зависимости от приоритета пользователя
            let cornerLetter = '';
            if (userPriority === 2) {
                cornerLetter = 'A';
            }

            // Передаем продукты, букву и приоритет пользователя в шаблон
            res.render('search', { books, cornerLetter, userPriority });
        });
    });
});

// Обработка GET запроса на страницу корзины
app.get('/cart', isAuthenticated, (req, res) => {
    // Получаем компоненты из сессии или базы данных корзины
    const cart = req.session.cart || [];

    // Получаем приоритет пользователя из сессии
    const userPriority = req.session.userPriority || 0;

    // Проверяем, что cart не пустой и содержит объекты с book_id
    if (cart.length > 0 && cart.every(item => item && item.book_id)) {
        const placeholders = cart.map(() => '?').join(',');
        db.query(`SELECT id, name, genre, description, price FROM books WHERE id IN (${placeholders})`, cart.map(item => item.book_id), (err, results) => {
            if (err) {
                console.error('Error fetching cart items:', err);
                return res.status(500).send('Error fetching cart items');
            }

            // Создаем массив для хранения информации о товарах в корзине
            const cartItems = [];

            // Создаем объект для каждого товара в корзине с дополнительной информацией о количестве
            results.forEach((book, index) => {
                const quantity = cart[index].quantity;
                cartItems.push({
                    id: book.id,
                    name: book.name,
                    description: book.description,
                    price: book.price,
                    quantity
                });
            });

            // Вычисляем общую стоимость товаров в корзине
            const totalCartPrice = cartItems.reduce((total, item) => total + item.price * item.quantity, 0);

            // Отображаем страницу корзины с информацией о товарах, общей стоимостью и приоритетом пользователя
            res.render('cart', { cart: cartItems, totalCartPrice, isAuthenticated: req.session.authenticated, userPriority });
        });
    } else {
        // Если корзина пуста или содержит неправильные данные, просто отображаем страницу корзины без товаров
        res.render('cart', { cart: [], totalCartPrice: 0, isAuthenticated: req.session.authenticated, userPriority });
    }
});

// Обработка добавления в корзину
app.post('/cart', (req, res) => {
    const { book_id, quantity } = req.body;
    
    // Добавляем выбранный продукт в сессию корзины
    req.session.cart = req.session.cart || []; // Создаем корзину, если она еще не существует
    req.session.cart.push({ book_id, quantity }); // Добавляем товар в корзину

    res.redirect('/'); // Перенаправляем пользователя на главную страницу после добавления товара в корзину
});

// Удаление товара из корзины
app.post('/cart/remove', (req, res) => {
    const bookIdToRemove = req.body.book_id;
    const cart = req.session.cart || [];

    // Фильтруем товары в корзине, оставляя только те, которые необходимо удалить
    req.session.cart = cart.filter(item => item.book_id !== bookIdToRemove);

    res.redirect('/cart'); // Перенаправляем пользователя на страницу корзины после удаления товара
});

// Страница Оформления заказа
app.get('/order', isAuthenticated, (req, res) => {
    const userPriority = req.session.userPriority || 0;
    res.render('order', { isAuthenticated: req.session.authenticated, userPriority });
});

// Обработка оформления заказа
app.post('/order', isAuthenticated, (req, res) => {
    const { name, address } = req.body;
    const userId = req.session.userId; // Предполагается, что userId сохранен в сессии после успешной аутентификации
    const orderDate = new Date(); // Получаем текущую дату и время
    const cart = req.session.cart || [];

    // Создание нового заказа в таблице orders
    db.query('INSERT INTO orders (user_id, order_date, name, address) VALUES (?, ?, ?, ?)',
        [userId, orderDate, name, address], (err, result) => {
            if (err) {
                console.error('Error creating order:', err);
                return res.status(500).send('Error creating order');
            }

            const orderId = result.insertId; // Получаем идентификатор только что созданного заказа

            // Добавление каждого товара из корзины в таблицу order_items
            const promises = cart.map(item => {
                return new Promise((resolve, reject) => {
                    db.query('INSERT INTO order_books (order_id, book_id, quantity) VALUES (?, ?, ?)',
                        [orderId, item.book_id, item.quantity], (err) => {
                            if (err) {
                                reject(err);
                            } else {
                                resolve();
                            }
                        });
                });
            });

            // Ждем завершения всех запросов к базе данных
            Promise.all(promises)
                .then(() => {
                    // После успешного добавления всех товаров в корзине в таблицу order_items, очищаем корзину
                    req.session.cart = [];
                    res.redirect('/cart'); // Перенаправляем на страницу корзины после успешного оформления заказа
                })
                .catch(error => {
                    console.error('Error adding order items:', error);
                    res.status(500).send('Error adding order items');
                });
        });
});
// Страница Авторизация
app.get('/login', (req, res) => {
    res.render('login', { isAuthenticated: req.session.authenticated });
});

// Роуты для админ-панели
app.get('/admin', isAuthenticated, (req, res) => {
    // Проверяем, аутентифицирован ли пользователь и имеет ли он приоритет 2
    if (req.session.authenticated && req.session.userPriority === 2) {
        // Если аутентификация пройдена и пользователь имеет приоритет 2, отображаем страницу админ-панели
        const cornerLetter = 'A'; // Пример значения для cornerLetter
        res.render('admin', { cornerLetter }); // Передаем cornerLetter в шаблон
    } else {
        // Если пользователь не аутентифицирован или у него нет приоритета 2, перенаправляем на главную страницу
        res.redirect('/');
    }
});

// Роут для отображения страницы управления книгами
app.get('/admin/books', isAuthenticated, (req, res) => {
    // Проверяем, аутентифицирован ли пользователь и имеет ли он приоритет 2
    if (req.session.authenticated && req.session.userPriority === 2) {
        // Если аутентификация пройдена и пользователь имеет приоритет 2, отображаем страницу управления продуктами
        db.query('SELECT * FROM books', (err, results) => {
            if (err) {
                console.error('Error fetching books:', err);
                return res.status(500).send('Error fetching books');
            }
            const books = results;
            // Добавляем переменную cornerLetter, которая будет передаваться в шаблон
            const cornerLetter = 'A'; // Пример значения для cornerLetter
            res.render('adminBooks', { books, cornerLetter });
        });
    } else {
        // Если пользователь не аутентифицирован или у него нет приоритета 2, перенаправляем на главную страницу
        res.redirect('/');
    }
});

// Роут для отображения страницы управления сотрудниками
app.get('/admin/employees', isAuthenticated, (req, res) => {
    // Проверяем, аутентифицирован ли пользователь и имеет ли он приоритет 2
    if (req.session.authenticated && req.session.userPriority === 2) {
        // Если аутентификация пройдена и пользователь имеет приоритет 2, отображаем страницу управления продуктами
        db.query('SELECT * FROM employees', (err, results) => {
            if (err) {
                console.error('Error fetching employees:', err);
                return res.status(500).send('Error fetching employees');
            }
            const employees = results;
            // Добавляем переменную cornerLetter, которая будет передаваться в шаблон
            const cornerLetter = 'A'; // Пример значения для cornerLetter
            res.render('adminEmployees', { employees, cornerLetter });
        });
    } else {
        // Если пользователь не аутентифицирован или у него нет приоритета 2, перенаправляем на главную страницу
        res.redirect('/');
    }
});

// Роут для обновления информации о книге
app.post('/admin/books/update/:bookId', isAuthenticated, (req, res) => {
    const { name, genre, description, price } = req.body;
    const bookId = req.params.bookId;
    
    // Проверяем, аутентифицирован ли пользователь и имеет ли он приоритет 2
    if (req.session.authenticated && req.session.userPriority === 2) {
        // Если аутентификация пройдена и пользователь имеет приоритет 2, обновляем информацию о продукте
        db.query('UPDATE books SET name = ?, genre = ?, description = ?, price = ? WHERE id = ?', [name, genre, description, price, bookId], (err) => {
            if (err) {
                console.error('Error updating book:', err);
                return res.status(500).send('Error updating book');
            }
            res.redirect('/admin/books');
        });
    } else {
        // Если пользователь не аутентифицирован или у него нет приоритета 2, перенаправляем на главную страницу
        res.redirect('/');
    }
});

app.post('/admin/employees/update/:employId', isAuthenticated, (req, res) => {
    const { name, address, birthday, phone, salary } = req.body;
    const employId = req.params.employId;
    
    // Проверяем, аутентифицирован ли пользователь и имеет ли он приоритет 2
    if (req.session.authenticated && req.session.userPriority === 2) {
        // Если аутентификация пройдена и пользователь имеет приоритет 2, обновляем информацию о продукте
        db.query('UPDATE employees SET name = ?, address = ?, birthday = ?, phone = ?, salary = ? WHERE id = ?', [name, address, birthday, phone, salary, employId], (err) => {
            if (err) {
                console.error('Error updating employ:', err);
                return res.status(500).send('Error updating employ');
            }
            res.redirect('/admin/employees');
        });
    } else {
        // Если пользователь не аутентифицирован или у него нет приоритета 2, перенаправляем на главную страницу
        res.redirect('/');
    }
});

// Роут для удаления книги
app.post('/admin/books/delete/:bookId', isAuthenticated, (req, res) => {
    const bookId = req.params.bookId;
    
    // Проверяем, аутентифицирован ли пользователь и имеет ли он приоритет 2
    if (req.session.authenticated && req.session.userPriority === 2) {
        // Если аутентификация пройдена и пользователь имеет приоритет 2, удаляем продукт
        db.query('DELETE FROM books WHERE id = ?', [bookId], (err) => {
            if (err) {
                console.error('Error deleting book:', err);
                return res.status(500).send('Error deleting book');
            }
            res.redirect('/admin/books');
        });
    } else {
        // Если пользователь не аутентифицирован или у него нет приоритета 2, перенаправляем на главную страницу
        res.redirect('/');
    }
});

app.post('/admin/employees/delete/:employId', isAuthenticated, (req, res) => {
    const employId = req.params.employId;
    
    // Проверяем, аутентифицирован ли пользователь и имеет ли он приоритет 2
    if (req.session.authenticated && req.session.userPriority === 2) {
        // Если аутентификация пройдена и пользователь имеет приоритет 2, удаляем продукт
        db.query('DELETE FROM employees WHERE id = ?', [employId], (err) => {
            if (err) {
                console.error('Error deleting employ:', err);
                return res.status(500).send('Error deleting employ');
            }
            res.redirect('/admin/employees');
        });
    } else {
        // Если пользователь не аутентифицирован или у него нет приоритета 2, перенаправляем на главную страницу
        res.redirect('/');
    }
});

// Роут для отображения зарегистрированных пользователей в админ панели
app.get('/admin/users', isAuthenticated, (req, res) => {
    // Проверяем, аутентифицирован ли пользователь и имеет ли он приоритет
    if (req.session.authenticated && req.session.userPriority === 2) {
        // Если аутентификация пройдена и пользователь имеет приоритет 2,
        // получаем информацию о зарегистрированных пользователях из базы данных
        db.query('SELECT * FROM users', (err, users) => {
            if (err) {
                console.error('Error fetching users:', err);
                return res.status(500).send('Error fetching users');
            }
            // Отображаем страницу админ панели с информацией о зарегистрированных пользователях
            res.render('adminUsers', { users });
        });
    } else {
        // Если пользователь не аутентифицирован или у него нет приоритета 2, перенаправляем на главную страницу
        res.redirect('/');
    }
});

// Роут для смены приоритета пользователя
app.post('/admin/users/switchPriority/:userId', isAuthenticated, (req, res) => {
    const userId = req.params.userId;
    
    // Проверяем, аутентифицирован ли пользователь и имеет ли он приоритет 2
    if (req.session.authenticated && req.session.userPriority === 2) {
        // Получаем текущий приоритет пользователя из базы данных
        db.query('SELECT priority FROM users WHERE id = ?', [userId], (err, results) => {
            if (err) {
                console.error('Error fetching user priority:', err);
                return res.status(500).send('Error fetching user priority');
            }

            if (results.length === 0) {
                return res.status(404).send('User not found');
            }

            const currentPriority = results[0].priority;
            const newPriority = currentPriority === 1 ? 2 : 1; // Если текущий приоритет 1, меняем на 2, и наоборот

            // Обновляем приоритет пользователя в базе данных
            db.query('UPDATE users SET priority = ? WHERE id = ?', [newPriority, userId], (err) => {
                if (err) {
                    console.error('Error updating user priority:', err);
                    return res.status(500).send('Error updating user priority');
                }

                res.redirect('/admin/users'); // Перенаправляем на страницу управления пользователями
            });
        });
    } else {
        // Если пользователь не аутентифицирован или у него нет приоритета 2, перенаправляем на главную страницу
        res.redirect('/');
    }
});


// Роут для отображения страницы управления заказами
app.get('/admin/orders', isAuthenticated, (req, res) => {
    // Проверяем, аутентифицирован ли пользователь и имеет ли он приоритет
    if (req.session.authenticated && req.session.userPriority) {
        // Если аутентификация пройдена, получаем информацию о заказах из базы данных
        db.query('SELECT * FROM orders', (err, orders) => {
            if (err) {
                console.error('Error fetching orders:', err);
                return res.status(500).send('Error fetching orders');
            }
            // Получаем информацию о товарах в каждом заказе, включая количество
            const promises = orders.map(order => {
                return new Promise((resolve, reject) => {
                    // Запрос к базе данных для получения информации о продуктах в заказе, включая количество
                    db.query('SELECT books.name, books.genre, books.description, books.price, order_books.quantity, (books.price*order_books.quantity) AS sum FROM books INNER JOIN order_books ON books.id = order_books.book_id WHERE order_books.order_id = ?', [order.id], (err, items) => {
                        if (err) {
                            reject(err);
                        } else {
                            order.items = items;
                            resolve(order);
                        }
                    });
                });
            });
            // Ждем завершения всех запросов к базе данных и отображаем страницу с полными данными о заказах
            Promise.all(promises)
                .then(ordersWithItems => {
                    res.render('adminOrders', { orders: ordersWithItems });
                })
                .catch(error => {
                    console.error('Error fetching order items:', error);
                    res.status(500).send('Error fetching order items');
                });
        });
    } else {
        // Если пользователь не аутентифицирован, перенаправляем на страницу входа
        res.redirect('/login');
    }
});

app.post('/login', (req, res) => {
    const { username, password, priority } = req.body;
    db.query('SELECT * FROM users WHERE username = ?', [username], (err, results) => {
        if (err) {
            console.error('Error fetching user:', err);
            return res.status(500).send('Error fetching user');
        }

        if (results.length === 0) {
            // Если пользователь не существует, добавляем его в базу данных
            db.query('INSERT INTO users (username, password, priority) VALUES (?, ?, ?)', [username, password, priority], (err) => {
                if (err) {
                    console.error('Error adding user:', err);
                    return res.status(500).send('Error adding user');
                }
                // Устанавливаем аутентификацию в сессии и идентификатор пользователя
                req.session.authenticated = true;
                req.session.userId = results.insertId; // Сохраняем идентификатор пользователя в сессии
                req.session.userPriority = priority; // Устанавливаем приоритет пользователя в сессии
                res.redirect('/');
            });
        } else {
            const user = results[0];
            if (user.password === password) {
                // Если пароль верный, устанавливаем флаг аутентификации и идентификатор пользователя в сессии
                req.session.authenticated = true;
                req.session.userId = user.id; // Сохраняем идентификатор пользователя в сессии
                req.session.userPriority = user.priority; // Устанавливаем приоритет пользователя в сессии
                res.redirect('/');
            } else {
                // Если пароль неверный, отображаем сообщение о неправильном пароле
                res.render('login', { error: 'Неправильный пароль', isAuthenticated: req.session.authenticated });
            }
        }
    });
});

// Роут для страницы справки
app.get('/help', (req, res) => {
    // Отображаем страницу справки
    res.render('help');
});

// Выход из аккаунта
app.get('/logout', (req, res) => {
    // Удаляем флаг аутентификации из сессии
    req.session.authenticated = false;
    res.redirect('/login');
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});

