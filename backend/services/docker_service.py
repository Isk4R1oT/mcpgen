"""Docker image build service — builds and pushes Docker images from generated MCP server code."""

import os
import tempfile

import docker

from backend.agents.models import GeneratedServer
from backend.pipeline.packager import generate_dockerfile


def build_image(server: GeneratedServer, server_name: str, tag: str | None) -> str:
    """Build a Docker image from a generated MCP server.

    Writes server files, Dockerfile, and requirements.txt to a temp directory,
    then invokes docker build via docker-py.

    Returns the full image tag (name:tag).
    """
    resolved_tag = tag if tag is not None else "latest"
    image_tag = f"{server_name}:{resolved_tag}"

    build_dir = tempfile.mkdtemp(prefix=f"mcpgen-{server_name}-")

    # Write server source files
    for generated_file in server.files:
        file_path = os.path.join(build_dir, generated_file.filename)
        os.makedirs(os.path.dirname(file_path), exist_ok=True)
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(generated_file.content)

    # Write requirements.txt
    requirements_content = "\n".join(server.requirements) + "\n"
    with open(os.path.join(build_dir, "requirements.txt"), "w", encoding="utf-8") as f:
        f.write(requirements_content)

    # Write Dockerfile
    dockerfile_content = generate_dockerfile(server)
    with open(os.path.join(build_dir, "Dockerfile"), "w", encoding="utf-8") as f:
        f.write(dockerfile_content)

    # Build image
    client = docker.from_env()
    client.images.build(
        path=build_dir,
        tag=image_tag,
        rm=True,
    )

    return image_tag


def push_image(tag: str, registry: str) -> str:
    """Tag an image for a registry and push it.

    Returns the full registry tag (registry/name:tag).
    """
    registry_tag = f"{registry}/{tag}"

    client = docker.from_env()
    image = client.images.get(tag)
    image.tag(registry_tag)
    client.images.push(registry_tag)

    return registry_tag
