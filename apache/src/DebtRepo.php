<?php
declare(strict_types=1);

final class DebtRepo
{
    private const COLUMNS = 'id, friend_name, amount, note, is_paid, created_at, updated_at';

    /** DB rows hold UTC DATETIMEs (the connection runs with time_zone +00:00). */
    public static function format(array $row): array
    {
        return [
            'id' => (int) $row['id'],
            'friend_name' => (string) $row['friend_name'],
            'amount' => (string) $row['amount'],
            'note' => $row['note'] === null ? null : (string) $row['note'],
            'is_paid' => (int) $row['is_paid'],
            'created_at' => self::iso((string) $row['created_at']),
            'updated_at' => self::iso((string) $row['updated_at']),
        ];
    }

    /** @return array{data: array, total: int} */
    public static function list(int $page, int $perPage, ?int $paid): array
    {
        $pdo = Db::pdo();
        $where = $paid === null ? '' : ' WHERE is_paid = :paid';

        $count = $pdo->prepare('SELECT COUNT(*) FROM debts' . $where);
        if ($paid !== null) {
            $count->bindValue(':paid', $paid, PDO::PARAM_INT);
        }
        $count->execute();

        $stmt = $pdo->prepare(
            'SELECT ' . self::COLUMNS . ' FROM debts' . $where . ' ORDER BY id DESC LIMIT :limit OFFSET :offset'
        );
        if ($paid !== null) {
            $stmt->bindValue(':paid', $paid, PDO::PARAM_INT);
        }
        $stmt->bindValue(':limit', $perPage, PDO::PARAM_INT);
        $stmt->bindValue(':offset', ($page - 1) * $perPage, PDO::PARAM_INT);
        $stmt->execute();

        return [
            'data' => array_map([self::class, 'format'], $stmt->fetchAll()),
            'total' => (int) $count->fetchColumn(),
        ];
    }

    public static function find(int $id): ?array
    {
        $stmt = Db::pdo()->prepare('SELECT ' . self::COLUMNS . ' FROM debts WHERE id = :id');
        $stmt->bindValue(':id', $id, PDO::PARAM_INT);
        $stmt->execute();
        $row = $stmt->fetch();
        return $row === false ? null : self::format($row);
    }

    public static function create(array $clean): array
    {
        $pdo = Db::pdo();
        $stmt = $pdo->prepare(
            'INSERT INTO debts (friend_name, amount, note, is_paid) VALUES (:name, :amount, :note, :paid)'
        );
        $stmt->execute([
            ':name' => $clean['friend_name'],
            ':amount' => $clean['amount'],
            ':note' => $clean['note'],
            ':paid' => $clean['is_paid'],
        ]);
        return self::find((int) $pdo->lastInsertId());
    }

    public static function update(int $id, array $clean): ?array
    {
        $stmt = Db::pdo()->prepare(
            'UPDATE debts SET friend_name = :name, amount = :amount, note = :note, is_paid = :paid WHERE id = :id'
        );
        $stmt->execute([
            ':name' => $clean['friend_name'],
            ':amount' => $clean['amount'],
            ':note' => $clean['note'],
            ':paid' => $clean['is_paid'],
            ':id' => $id,
        ]);
        // rowCount() is 0 for an unchanged row, so existence is decided by the re-read.
        return self::find($id);
    }

    public static function delete(int $id): bool
    {
        $stmt = Db::pdo()->prepare('DELETE FROM debts WHERE id = :id');
        $stmt->bindValue(':id', $id, PDO::PARAM_INT);
        $stmt->execute();
        return $stmt->rowCount() > 0;
    }

    /** @return array{total_unpaid: string, count_unpaid: int, count_paid: int, count_all: int, count_friends_unpaid: int, generated_at: string} */
    public static function summary(): array
    {
        $row = Db::pdo()->query(
            'SELECT CAST(COALESCE(SUM(CASE WHEN is_paid = 0 THEN amount END), 0) AS DECIMAL(12,2)) AS total_unpaid,
                    COUNT(CASE WHEN is_paid = 0 THEN 1 END) AS count_unpaid,
                    COUNT(CASE WHEN is_paid = 1 THEN 1 END) AS count_paid,
                    COUNT(*) AS count_all,
                    COUNT(DISTINCT CASE WHEN is_paid = 0 THEN friend_name END) AS count_friends_unpaid
             FROM debts'
        )->fetch();
        return [
            'total_unpaid' => (string) $row['total_unpaid'],
            'count_unpaid' => (int) $row['count_unpaid'],
            'count_paid' => (int) $row['count_paid'],
            'count_all' => (int) $row['count_all'],
            'count_friends_unpaid' => (int) $row['count_friends_unpaid'],
            'generated_at' => gmdate('Y-m-d\TH:i:s\Z'),
        ];
    }

    private static function iso(string $datetime): string
    {
        return str_replace(' ', 'T', $datetime) . 'Z';
    }
}
