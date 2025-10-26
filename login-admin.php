<?php
session_start();

if (isset($_SESSION['admin_logged_in']) && $_SESSION['admin_logged_in'] === true) {
    header('Location: dashboard.php');
    exit();
}

require_once 'config.php';

$error_message = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $email = trim($_POST['email']);
    $password = trim($_POST['password']);
    
    if (!empty($email) && !empty($password)) {
        try {
            $stmt = $pdo->prepare("SELECT * FROM Admin WHERE email = ?");
            $stmt->execute([$email]);
            $admin = $stmt->fetch(PDO::FETCH_ASSOC);
            
            if ($admin && $admin['mot_de_passe'] === $password) {
                $_SESSION['admin_logged_in'] = true;
                $_SESSION['admin_id'] = $admin['id_admin'];
                $_SESSION['admin_email'] = $admin['email'];
                header('Location: dashboard.php');
                exit();
            } else {
                $error_message = 'Email ou mot de passe incorrect';
            }
        } catch (PDOException $e) {
            $error_message = 'Erreur de la base de données';
        }
    } else {
        $error_message = 'Veuillez remplir tous les champs';
    }
}
?>

<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Admin - ProFoot</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #1f2937 0%, #374151 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }

        .login-container {
            background: white;
            padding: 40px;
            border-radius: 15px;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
            width: 100%;
            max-width: 450px;
            position: relative;
        }

        .login-header {
            text-align: center;
            margin-bottom: 30px;
        }

        .admin-badge {
            background: linear-gradient(135deg, gray, red);
            color: white;
            padding: 8px 16px;
            border-radius: 25px;
            font-size: 12px;
            font-weight: 600;
            letter-spacing: 0.5px;
            margin-bottom: 20px;
            display: inline-block;
        }

        .login-header h1 {
            color: #1f2937;
            font-size: 28px;
            font-weight: 700;
            margin-bottom: 8px;
        }

        .login-header p {
            color: #6b7280;
            font-size: 16px;
        }

        .form-group {
            margin-bottom: 20px;
        }

        .form-group label {
            display: block;
            margin-bottom: 8px;
            color: #374151;
            font-weight: 500;
            font-size: 14px;
        }

        .form-group input {
            width: 100%;
            padding: 14px 18px;
            border: 2px solid #e5e7eb;
            border-radius: 10px;
            font-size: 16px;
            transition: all 0.3s ease;
            background-color: #f9fafb;
        }

        .form-group input:focus {
            border-color: blue;
            outline: none;
            background-color: white;
        }

        .login-button {
            width: 100%;
            padding: 16px;
            background: linear-gradient(135deg, gray, red);
            color: white;
            border: none;
            border-radius: 10px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
            margin-top: 10px;
            letter-spacing: 0.5px;
        }

        .login-button:hover {
            transform: translateY(-2px);
            box-shadow: 0 10px 25px rgba(220, 38, 38, 0.3);
        }
        .error-message {
            background: #fef2f2;
            border: 1px solid #fecaca;
            color: #dc2626;
            padding: 12px;
            border-radius: 8px;
            margin-bottom: 20px;
            text-align: center;
            font-size: 14px;
        }

    </style>
</head>
<body>
    <div class="login-container">
        <div class="login-header">
            <div class="admin-badge">ADMINISTRATION</div>
            <h1>Connexion Admin</h1>
            <p>Accédez à votre espace d'administration ProFoot</p>
        </div>
        
        <?php if (!empty($error_message)): ?>
            <div class="error-message">
                <?php echo htmlspecialchars($error_message); ?>
            </div>
        <?php endif; ?>
        
        <form method="POST" class="login-form">
            <div class="form-group">
                <label for="email">Adresse email</label>
                <input type="email" id="email" name="email" required 
                       value="<?php echo isset($_POST['email']) ? htmlspecialchars($_POST['email']) : ''; ?>">
            </div>
            
            <div class="form-group">
                <label for="password">Mot de passe</label>
                <input type="password" id="password" name="password" required >
            </div>
            
            <button type="submit" class="login-button">Se Connecter</button>
        </form>
    </div>
</body>
</html>     
