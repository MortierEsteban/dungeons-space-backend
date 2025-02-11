class Character:
    """saving_throws(success,fail)"""
    def __init__(self, name, max_hp, damage, initiative=0, status=None, saving_throws=(0,0)):
        self.name = name
        self.max_hp = max_hp
        self.hp = max_hp  # Current HP starts as max HP
        self.damage = damage
        self.initiative = initiative
        self.status = status if status else []
        self.saving_throws = saving_throws

    def take_damage(self, amount):
        """Reduces the character's HP by the given amount."""
        self.hp = max(self.hp - amount, 0)  # HP cannot go below 0

    def heal(self, amount):
        """Heals the character by the given amount."""
        self.hp = min(self.hp + amount, self.max_hp)  # HP cannot exceed max HP

    def apply_status(self, status):
        """Applies a new status effect to the character."""
        if status not in self.status:
            self.status.append(status)

    def remove_status(self, status):
        """Removes a status effect from the character."""
        if status in self.status:
            self.status.remove(status)

    def is_alive(self):
        """Checks if the character is still alive (HP > 0)."""
        return self.hp > 0

    def __str__(self):
        """Returns a string representation of the character."""
        return f"{self.name} (HP: {self.hp}/{self.max_hp}, Damage: {self.damage}, Initiative: {self.initiative}, Status: {', '.join(self.status)})"