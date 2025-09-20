#include <emscripten/bind.h>
#include <vector>
#include <geogram/mesh/mesh.h>
#include <geogram/basic/attributes.h>
#include <geogram/mesh/mesh_geometry.h>
#include <geogram/mesh/mesh_remesh.h>
#include <geogram/mesh/mesh_repair.h>
#include <geogram/basic/command_line.h>
#include <geogram/basic/command_line_args.h>

using namespace emscripten;

struct RemeshResult
{
    std::vector<double> vertices;
    std::vector<int> indices;
};

RemeshResult remesh(
    const std::vector<double> &vertices_in,
    const std::vector<int> &indices_in,
    int num_vertices,
    int num_indices,
    int target_num_points, // Desired output number of vertices
    int remesh_dim = 3     // 3 for isotropic, 6 for anisotropic
)
{
    GEO::initialize(); // Required for Geogram
    GEO::CmdLine::import_arg_group("standard");
    GEO::CmdLine::import_arg_group("algo");

    // --- Build input mesh ---
    GEO::Mesh mesh_in;
    mesh_in.vertices.create_vertices(num_vertices);

    // Fill vertex positions
    GEO::Attribute<double> points(mesh_in.vertices.attributes(), "point");
    for (int i = 0; i < num_vertices; ++i)
    {
        points[i * 3 + 0] = vertices_in[i * 3 + 0];
        points[i * 3 + 1] = vertices_in[i * 3 + 1];
        points[i * 3 + 2] = vertices_in[i * 3 + 2];
    }

    // Fill triangles
    int num_triangles = num_indices / 3;
    mesh_in.facets.create_triangles(num_triangles);
    for (int i = 0; i < num_triangles; ++i)
    {
        mesh_in.facets.set_vertex(i, 0, indices_in[i * 3 + 0]);
        mesh_in.facets.set_vertex(i, 1, indices_in[i * 3 + 1]);
        mesh_in.facets.set_vertex(i, 2, indices_in[i * 3 + 2]);
    }

    // --- Remesh ---
    GEO::Mesh mesh_out;

    // mesh repair
    GEO::mesh_repair(mesh_in);

    // int nb_iter = 1;
    // double anisotropy = 2.0;

    // GEO::compute_normals(mesh_in);
    // GEO::simple_Laplacian_smooth(mesh_in, nb_iter, true); // true: smooth normals
    // GEO::set_anisotropy(mesh_in, anisotropy * 0.02);

    // Isotropic remeshing (with equilateral triangles)
    // GEO::compute_sizing_field(mesh_in, 1.0);
    GEO::remesh_smooth(mesh_in, mesh_out, target_num_points, 3);

    // --- Export output mesh ---
    GEO::Attribute<double> out_points(mesh_out.vertices.attributes(), "point");
    int out_vertices = mesh_out.vertices.nb();
    RemeshResult result;
    for (int i = 0; i < out_vertices; ++i)
    {
        result.vertices.push_back(out_points[i * 3 + 0]);
        result.vertices.push_back(out_points[i * 3 + 1]);
        result.vertices.push_back(out_points[i * 3 + 2]);
    }

    int out_triangles = mesh_out.facets.nb();
    for (int i = 0; i < out_triangles; ++i)
    {
        result.indices.push_back(mesh_out.facets.vertex(i, 0));
        result.indices.push_back(mesh_out.facets.vertex(i, 1));
        result.indices.push_back(mesh_out.facets.vertex(i, 2));
    }

    return result;
}

// Embind binding
EMSCRIPTEN_BINDINGS(remesh_module)
{
    // Register vector types so JS can pass/receive them
    register_vector<double>("VectorDouble");
    register_vector<int>("VectorInt");

    value_object<RemeshResult>("RemeshResult")
        .field("vertices", &RemeshResult::vertices)
        .field("indices", &RemeshResult::indices);

    function("remesh", &remesh);
}