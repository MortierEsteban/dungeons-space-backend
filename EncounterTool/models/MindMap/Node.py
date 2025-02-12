from django.contrib.postgres.fields import ArrayField
from django.db import models


class NodeView(models.Model):
    id = models.IntegerField(primary_key=True)
    name = models.CharField(max_length=255)
    description = models.TextField()
    type = models.CharField(max_length=50)

    class Meta:
        db_table = 'node_view'

    def __str__(self):
        return f"{self.name} ({self.type})"


class NodeConnection(models.Model):
    from_node = models.ForeignKey('NodeView', related_name='from_connections', on_delete=models.CASCADE)
    to_node = models.ForeignKey('NodeView', related_name='to_connections', on_delete=models.CASCADE)
    relation_description = relation_descriptions = ArrayField(
        models.CharField(max_length=255),
        blank=True,
        default=list,
        help_text="List of descriptions detailing the relationship."
)

    def __str__(self):
        return f'{self.from_node.name} -> {self.to_node.name}: {self.relation_description}'
