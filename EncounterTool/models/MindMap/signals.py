from django.db.models.signals import post_save
from django.dispatch import receiver
from .Node import NodeView
from EncounterTool.models.Data.Character import Character

@receiver(post_save, sender=Character)
def create_node_for_character(sender, instance, created, **kwargs):
    if created:
        NodeView.objects.create(name=instance.name, node_type='character')

# @receiver(post_save, sender=Item)
# def create_node_for_item(sender, instance, created, **kwargs):
#     if created:
#         NodeView.objects.create(name=instance.name, node_type='item')
#
# @receiver(post_save, sender=Place)
# def create_node_for_place(sender, instance, created, **kwargs):
#     if created:
#         NodeView.objects.create(name=instance.name, node_type='place')
