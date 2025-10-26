 <?php

$host = "localhost";      
$dbname = "TESTER";       
$username = "root";       
$password = "AMA_OUT@2007@";           

try {
    $pdo = new PDO("mysql:host=$host;dbname=$dbname;charset=utf8", $username, $password);
    
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

} catch (PDOException $e) {
    echo "Erreur de connexion : " . $e->getMessage();
}
?>   